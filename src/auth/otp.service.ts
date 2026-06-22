import { Injectable, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import * as crypto from 'crypto';
import { EmailService } from './email.service';

// We'll store OTPs in a simple database table
// This is more reliable than Redis for this use case
import { OtpRecord } from './otp-record.entity';

/**
 * Anonymize an email for logging. Returns an 8-char SHA-256 prefix so the
 * same user can be correlated across log lines without leaking the address.
 * Defends against log-leak → user enumeration.
 */
function hashEmail(email: string): string {
  return 'u:' + crypto.createHash('sha256').update(email).digest('hex').slice(0, 8);
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly OTP_EXPIRY_MINUTES = 10;
  private readonly MAX_WRONG_ATTEMPTS = 2;
  private readonly BLOCK_DURATION_MINUTES = 10;

  constructor(
    @InjectRepository(OtpRecord)
    private otpRepo: Repository<OtpRecord>,
    private emailService: EmailService,
  ) {}

  /**
   * Generate and send a 6-digit OTP to an email address
   */
  async sendOTP(email: string): Promise<{ message: string }> {
    const normalizedEmail = (email || '').toLowerCase().trim();

    // RFC 5321 caps the full address at 254 chars — anything longer is either
    // a typo or a DoS attempt.
    if (normalizedEmail.length > 254) {
      throw new BadRequestException('Email address is too long.');
    }

    // Basic email-shape validation BEFORE inserting OTP records or calling Mailgun.
    // Defends against typos like "name.gmail.com" (missing @) — Mailgun rejects
    // these silently and our user gets a confusing "Failed to send" error.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new BadRequestException(
        "That email doesn't look right. Did you forget the @ or .com?",
      );
    }

    // Check if email is currently blocked
    const blocked = await this.isBlocked(normalizedEmail);
    if (blocked) {
      throw new ForbiddenException(
        'Too many wrong attempts. This email is temporarily blocked. Try again in 10 minutes.',
      );
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Invalidate any existing OTPs for this email
    await this.otpRepo.update(
      { email: normalizedEmail, used: false },
      { used: true },
    );

    // Save new OTP
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.OTP_EXPIRY_MINUTES);

    const record = this.otpRepo.create({
      email: normalizedEmail,
      code,
      expiresAt,
      wrongAttempts: 0,
      used: false,
      blocked: false,
    });
    await this.otpRepo.save(record);

    // Send email
    const sent = await this.emailService.sendOTP(normalizedEmail, code);
    if (!sent) {
      throw new BadRequestException('Failed to send verification email. Please try again.');
    }

    this.logger.log('OTP generated for ' + hashEmail(normalizedEmail));
    return { message: 'Verification code sent to ' + normalizedEmail };
  }

  /**
   * Verify an OTP code
   */
  async verifyOTP(email: string, code: string): Promise<{ verified: boolean }> {
    const normalizedEmail = email.toLowerCase().trim();

    // Check if blocked
    const blocked = await this.isBlocked(normalizedEmail);
    if (blocked) {
      throw new ForbiddenException(
        'Too many wrong attempts. This email is temporarily blocked. Try again in 10 minutes.',
      );
    }

    // Find the latest unused OTP for this email
    const record = await this.otpRepo.findOne({
      where: {
        email: normalizedEmail,
        used: false,
        blocked: false,
      },
      order: { createdAt: 'DESC' },
    });

    if (!record) {
      throw new BadRequestException('No verification code found. Request a new one.');
    }

    // Check expiry
    if (new Date() > record.expiresAt) {
      record.used = true;
      await this.otpRepo.save(record);
      throw new BadRequestException('Code expired. Request a new one.');
    }

    // Check code
    if (record.code !== code.trim()) {
      record.wrongAttempts += 1;
      
      if (record.wrongAttempts > this.MAX_WRONG_ATTEMPTS) {
        // Block the email
        record.blocked = true;
        record.blockedUntil = new Date();
        record.blockedUntil.setMinutes(record.blockedUntil.getMinutes() + this.BLOCK_DURATION_MINUTES);
        await this.otpRepo.save(record);
        
        this.logger.warn('Email blocked due to too many wrong OTP attempts: ' + hashEmail(normalizedEmail));
        throw new ForbiddenException(
          'Too many wrong attempts. This email is blocked for 10 minutes.',
        );
      }

      await this.otpRepo.save(record);
      const remaining = this.MAX_WRONG_ATTEMPTS - record.wrongAttempts + 1;
      throw new BadRequestException(
        'Wrong code. ' + remaining + ' attempt' + (remaining === 1 ? '' : 's') + ' remaining before your email is temporarily blocked.',
      );
    }

    // Code matches — mark as used
    record.used = true;
    record.verifiedAt = new Date();
    await this.otpRepo.save(record);

    this.logger.log('OTP verified for ' + hashEmail(normalizedEmail));
    return { verified: true };
  }

  /**
   * Check if an email is currently blocked
   */
  private async isBlocked(email: string): Promise<boolean> {
    const blockedRecord = await this.otpRepo.findOne({
      where: {
        email,
        blocked: true,
      },
      order: { createdAt: 'DESC' },
    });

    if (!blockedRecord || !blockedRecord.blockedUntil) return false;
    
    if (new Date() > blockedRecord.blockedUntil) {
      // Block has expired — unblock
      blockedRecord.blocked = false;
      await this.otpRepo.save(blockedRecord);
      return false;
    }

    return true;
  }
}
