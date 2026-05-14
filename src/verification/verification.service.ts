import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IdVerification, VerificationStatus, IdType } from './id-verification.entity';
import { User, UserStatus } from '../users/user.entity';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    @InjectRepository(IdVerification)
    private verificationRepo: Repository<IdVerification>,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  /**
   * Get all pending verifications (for admin/staff queue)
   */
  async getPendingVerifications(): Promise<IdVerification[]> {
    return this.verificationRepo.find({
      where: { status: VerificationStatus.PENDING },
      relations: ['user'],
      order: { createdAt: 'ASC' }, // oldest first
    });
  }

  /**
   * Get verification status for a specific user
   */
  async getVerificationForUser(userId: string): Promise<IdVerification | null> {
    return this.verificationRepo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Staff approves a user's ID after checking it in person.
   * This:
   * 1. Updates the verification record with ID photo + type
   * 2. Sets verification status to APPROVED
   * 3. Updates user status from PENDING to VERIFIED
   */
  async approveVerification(
    verificationId: string,
    staffId: string,
    data: {
      idPhotoUrl: string;
      idType: IdType;
      idDateOfBirth: Date;
    },
  ): Promise<IdVerification> {
    const verification = await this.verificationRepo.findOne({
      where: { id: verificationId },
      relations: ['user'],
    });

    if (!verification) {
      throw new NotFoundException('Verification record not found');
    }

    if (verification.status !== VerificationStatus.PENDING) {
      throw new BadRequestException('This verification has already been processed');
    }

    // Verify the DOB on the ID matches what user entered (± tolerance)
    const userDob = new Date(verification.user.dateOfBirth);
    const idDob = new Date(data.idDateOfBirth);
    if (userDob.toDateString() !== idDob.toDateString()) {
      this.logger.warn(
        `DOB mismatch for user ${verification.userId}: ` +
        `profile says ${userDob.toDateString()}, ID says ${idDob.toDateString()}`,
      );
      // We still allow approval — staff makes the final call
      // but we log the discrepancy
    }

    // Update verification record
    verification.status = VerificationStatus.APPROVED;
    verification.verifiedByStaffId = staffId;
    verification.idPhotoUrl = data.idPhotoUrl;
    verification.idType = data.idType;
    verification.idDateOfBirth = data.idDateOfBirth;
    verification.verifiedAt = new Date();
    await this.verificationRepo.save(verification);

    // Update user status to VERIFIED
    await this.userRepo.update(verification.userId, {
      status: UserStatus.VERIFIED,
    });

    this.logger.log(`User ${verification.userId} verified by staff ${staffId}`);

    return verification;
  }

  /**
   * Staff rejects a user's ID.
   */
  async rejectVerification(
    verificationId: string,
    staffId: string,
    reason: string,
  ): Promise<IdVerification> {
    const verification = await this.verificationRepo.findOne({
      where: { id: verificationId },
    });

    if (!verification) {
      throw new NotFoundException('Verification record not found');
    }

    verification.status = VerificationStatus.REJECTED;
    verification.verifiedByStaffId = staffId;
    verification.rejectionReason = reason;
    verification.verifiedAt = new Date();
    await this.verificationRepo.save(verification);

    this.logger.log(`User ${verification.userId} verification rejected: ${reason}`);

    return verification;
  }
}
