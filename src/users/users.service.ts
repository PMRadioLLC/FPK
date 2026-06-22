import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { User, UserStatus } from './user.entity';
import { BarcodeSecret } from '../barcode/barcode-secret.entity';
import { Membership, MembershipStatus } from '../memberships/membership.entity';
import { DrinkRequest } from '../drink-requests/drink-request.entity';
import { IdVerification, VerificationStatus } from '../verification/id-verification.entity';
import { decodeImageBase64 } from '../common/image-validator';
import { FirebaseService } from '../auth/firebase.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly rotationSeconds: number;

  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(BarcodeSecret) private secretRepo: Repository<BarcodeSecret>,
    @InjectRepository(Membership) private membershipRepo: Repository<Membership>,
    @InjectRepository(DrinkRequest) private drinkRequestRepo: Repository<DrinkRequest>,
    @InjectRepository(IdVerification) private idVerificationRepo: Repository<IdVerification>,
    private configService: ConfigService,
    private firebaseService: FirebaseService,
  ) {
    this.rotationSeconds = parseInt(
      this.configService.get('BARCODE_ROTATION_SECONDS', '30'),
    );
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email } });
  }

  async updateSelfie(userId: string, selfieUrl: string): Promise<User> {
    await this.userRepo.update(userId, { selfieUrl });
    return this.findById(userId);
  }

  /**
   * Upload a selfie from base64 and save the URL on the user. Server-side upload
   * to Firebase Storage avoids the RN + Firebase-JS-SDK Blob compatibility issue.
   */
  async updateSelfieFromBase64(userId: string, base64: string): Promise<User> {
    // Validates magic bytes + size (5 MB max for selfies).
    const bytes = decodeImageBase64(base64, { maxBytes: 5 * 1024 * 1024, label: 'selfie' });
    const path = `selfies/${userId}_${Date.now()}.jpg`;
    const url = await this.firebaseService.uploadFile(path, bytes, 'image/jpeg');

    await this.userRepo.update(userId, { selfieUrl: url });
    return this.findById(userId);
  }

  async banUser(userId: string): Promise<User> {
    // Bump token_version so any active sessions are immediately invalidated.
    // Without this a banned user could keep using the app until their 7-day
    // JWT naturally expired.
    await this.userRepo
      .createQueryBuilder()
      .update(User)
      .set({ status: UserStatus.BANNED, tokenVersion: () => 'token_version + 1' })
      .where('id = :id', { id: userId })
      .execute();
    return this.findById(userId);
  }

  async unbanUser(userId: string): Promise<User> {
    await this.userRepo.update(userId, { status: UserStatus.VERIFIED });
    return this.findById(userId);
  }

  async getAllMembers(page = 1, limit = 20): Promise<{ users: User[]; total: number }> {
    const [users, total] = await this.userRepo.findAndCount({
      where: { role: 'member' as any },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { users, total };
  }

  async searchUsers(query: string): Promise<User[]> {
    return this.userRepo
      .createQueryBuilder('user')
      .where('user.full_name ILIKE :query OR user.email ILIKE :query', {
        query: `%${query}%`,
      })
      .orderBy('user.created_at', 'DESC')
      .limit(20)
      .getMany();
  }

  /**
   * Verify a member's barcode payload and return their full profile + history.
   * Used by Owner/Manager when scanning to verify someone's ID.
   *
   * Accepts two formats:
   *  - `FPKV:{userId}`             — static verification barcode (any user, no TOTP)
   *  - `FPK:{userId}:{token}:{ts}` — rotating drink barcode (active members only)
   */
  async lookupByQrPayload(qrPayload: string) {
    let userId: string;

    if (qrPayload.startsWith('FPKV:')) {
      // Static verification barcode — just extract userId
      const parts = qrPayload.split(':');
      if (parts.length < 2) {
        throw new BadRequestException('Invalid verification barcode');
      }
      userId = parts[1];
    } else if (qrPayload.startsWith('FPK:')) {
      // Rotating drink barcode — validate TOTP
      const parts = qrPayload.split(':');
      if (parts.length !== 4) {
        throw new BadRequestException('Invalid barcode format');
      }
      const [, uid, token] = parts;
      userId = uid;

      const secret = await this.secretRepo.findOne({ where: { userId } });
      if (!secret) throw new BadRequestException('Invalid barcode');

      const currentWindow = Math.floor(Date.now() / (this.rotationSeconds * 1000));
      let valid = false;
      for (const window of [currentWindow, currentWindow - 1]) {
        const expected = crypto
          .createHmac('sha256', secret.secretKey)
          .update(`${userId}:${window}`)
          .digest('hex');
        if (token === expected) { valid = true; break; }
      }
      if (!valid) {
        throw new BadRequestException('Barcode expired — ask member to refresh');
      }
    } else {
      throw new BadRequestException('Invalid barcode format');
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Member not found');

    // Pull membership
    const membership = await this.membershipRepo.findOne({
      where: { userId, status: MembershipStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });

    // Recent drink requests (last 5)
    const recentRequests = await this.drinkRequestRepo.find({
      where: { userId },
      relations: ['drinkItem', 'location'],
      order: { createdAt: 'DESC' },
      take: 5,
    });

    // Who verified them (if any)
    let verifiedBy: { fullName: string } | null = null;
    if (user.verifiedById) {
      const verifier = await this.userRepo.findOne({
        where: { id: user.verifiedById },
        select: ['fullName'],
      });
      if (verifier) verifiedBy = { fullName: verifier.fullName };
    }

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        dateOfBirth: user.dateOfBirth,
        selfieUrl: user.selfieUrl,
        status: user.status,
        isVerified: user.status === UserStatus.VERIFIED,
        verifiedAt: user.verifiedAt,
        idPhotoUrl: user.idPhotoUrl,
      },
      verifiedBy,
      membership: membership
        ? {
            plan: membership.plan,
            expiresAt: membership.expiresAt,
            autoRenew: membership.autoRenew,
          }
        : null,
      recentRequests: recentRequests.map(r => ({
        id: r.id,
        drinkName: r.drinkItem?.name,
        locationName: r.location?.name,
        tableNumber: r.tableNumber,
        status: r.status,
        createdAt: r.createdAt,
      })),
    };
  }

  /**
   * Mark a member as verified — accepts a base64-encoded ID photo,
   * uploads it server-side to Firebase Storage, and records the audit.
   *
   * (Server-side upload avoids the React-Native + Firebase-JS-SDK Blob
   * incompatibility — much more reliable than uploading from the phone.)
   */
  async verifyUser(
    targetUserId: string,
    verifierId: string,
    idPhotoBase64: string,
  ): Promise<User> {
    const target = await this.userRepo.findOne({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('User not found');

    // Validates magic bytes + size (5 MB max for ID photos).
    const bytes = decodeImageBase64(idPhotoBase64, { maxBytes: 5 * 1024 * 1024, label: 'ID photo' });

    // Upload to Firebase Storage server-side
    const path = `id-verifications/${targetUserId}_${Date.now()}.jpg`;
    const idPhotoUrl = await this.firebaseService.uploadFile(path, bytes, 'image/jpeg');

    const now = new Date();
    target.status = UserStatus.VERIFIED;
    target.verifiedById = verifierId;
    target.verifiedAt = now;
    target.idPhotoUrl = idPhotoUrl;
    await this.userRepo.save(target);

    // Audit trail row in id_verifications
    const audit = this.idVerificationRepo.create({
      userId: targetUserId,
      verifiedByStaffId: verifierId,
      idPhotoUrl,
      status: VerificationStatus.APPROVED,
      verifiedAt: now,
    });
    await this.idVerificationRepo.save(audit);

    this.logger.log(`User ${targetUserId} verified by ${verifierId}`);
    return target;
  }
}
