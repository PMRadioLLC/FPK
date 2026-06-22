import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from '../users/user.entity';
import { IdVerification } from '../verification/id-verification.entity';
import { Membership, MembershipStatus } from '../memberships/membership.entity';
import { BarcodeSecret } from '../barcode/barcode-secret.entity';
import { FirebaseService } from './firebase.service';
import { RegisterDto, AuthResponseDto } from './auth.dto';
import { JwtPayload } from './jwt.strategy';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly MIN_AGE = 21;

  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(IdVerification) private verificationRepo: Repository<IdVerification>,
    @InjectRepository(Membership) private membershipRepo: Repository<Membership>,
    @InjectRepository(BarcodeSecret) private barcodeSecretRepo: Repository<BarcodeSecret>,
    private firebaseService: FirebaseService,
    private jwtService: JwtService,
  ) {}

  // ==========================================
  // LOGIN — existing user signs in
  // ==========================================
  async login(firebaseIdToken: string): Promise<AuthResponseDto> {
    // 1. Verify the Firebase token
    const decoded = await this.verifyFirebaseToken(firebaseIdToken);

    // 2. Find the user by Firebase UID
    const user = await this.userRepo.findOne({
      where: { firebaseUid: decoded.uid },
    });

    if (!user) {
      throw new UnauthorizedException(
        'NO_ACCOUNT',
        // The mobile app will read this error code and redirect to sign-up
      );
    }

    // 3. Check if banned
    if (user.status === UserStatus.BANNED) {
      throw new UnauthorizedException('Your account has been banned. Contact support.');
    }

    // 4. Build response with membership/verification status
    return this.buildAuthResponse(user);
  }

  // ==========================================
  // REGISTER — new user creates account
  // ==========================================
  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    // 1. Verify the Firebase token
    const decoded = await this.verifyFirebaseToken(dto.firebaseIdToken);

    // 2. Check if user already exists
    const existing = await this.userRepo.findOne({
      where: [
        { firebaseUid: decoded.uid },
        { email: decoded.email },
      ],
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    // 3. Age verification — must be 21+
    const age = this.calculateAge(new Date(dto.dateOfBirth));
    if (age < this.MIN_AGE) {
      throw new BadRequestException(
        `You must be at least ${this.MIN_AGE} years old to register.`,
      );
    }

    // 4. Create the user
    const user = this.userRepo.create({
      email: decoded.email,
      fullName: dto.fullName,
      dateOfBirth: new Date(dto.dateOfBirth),
      phone: dto.phone || null,
      firebaseUid: decoded.uid,
      status: UserStatus.PENDING, // stays pending until ID verified in person
    });
    await this.userRepo.save(user);

    // 5. Create a pending ID verification record
    const verification = this.verificationRepo.create({
      userId: user.id,
    });
    await this.verificationRepo.save(verification);

    // 6. Generate a TOTP secret for barcode (ready for when they get membership)
    const secret = crypto.randomBytes(32).toString('hex');
    const barcodeSecret = this.barcodeSecretRepo.create({
      userId: user.id,
      secretKey: secret,
    });
    await this.barcodeSecretRepo.save(barcodeSecret);

    this.logger.log(`New user registered: ${user.email} (age: ${age})`);

    // 7. Return JWT
    return this.buildAuthResponse(user);
  }

  // ==========================================
  // UPLOAD SELFIE — called after registration
  // ==========================================
  async updateSelfie(userId: string, selfieUrl: string): Promise<void> {
    await this.userRepo.update(userId, { selfieUrl });
  }

  // ==========================================
  // HELPER: Verify Firebase token
  // ==========================================
  private async verifyFirebaseToken(token: string) {
    try {
      return await this.firebaseService.verifyIdToken(token);
    } catch (error) {
      this.logger.error(`Firebase token verification failed: ${error.message}`);
      throw new UnauthorizedException('Invalid or expired authentication token.');
    }
  }

  // ==========================================
  // HELPER: Calculate age from DOB
  // ==========================================
  private calculateAge(dateOfBirth: Date): number {
    const today = new Date();
    let age = today.getFullYear() - dateOfBirth.getFullYear();
    const monthDiff = today.getMonth() - dateOfBirth.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())
    ) {
      age--;
    }
    return age;
  }

  // ==========================================
  // HELPER: Build the auth response with JWT + user info
  // ==========================================
  private async buildAuthResponse(user: User): Promise<AuthResponseDto> {
    // Check verification status
    const verification = await this.verificationRepo.findOne({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
    });

    // Check active membership
    const activeMembership = await this.membershipRepo.findOne({
      where: {
        userId: user.id,
        status: MembershipStatus.ACTIVE,
      },
    });

    // Generate JWT — embed tokenVersion so we can revoke this token later
    // (on ban, role change, etc.) by bumping users.token_version.
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      tv: user.tokenVersion ?? 0,
    };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
        selfieUrl: user.selfieUrl,
        hasActiveMembership: !!activeMembership,
        isVerified: verification?.status === 'approved',
      },
    };
  }
}
