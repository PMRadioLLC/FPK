#!/usr/bin/env node
// Run from fpk-backend folder: node setup-email-verification.js

const fs = require('fs');
const path = require('path');

function writeFile(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content);
  console.log('  Created: ' + filePath);
}

if (!fs.existsSync('node_modules/@nestjs/core')) {
  console.error('ERROR: Run this from inside your fpk-backend folder!');
  process.exit(1);
}

console.log('\\nAdding email verification with Mailgun OTP...\\n');

// ============================================================
// Email Service (Mailgun via SMTP)
// ============================================================
writeFile('src/auth/email.service.ts', `import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: 'smtp.mailgun.org',
      port: 587,
      secure: false,
      auth: {
        user: this.configService.get<string>('MAILGUN_SMTP_USER', 'postmaster@funpizzakitchen.com'),
        pass: this.configService.get<string>('MAILGUN_SMTP_PASSWORD', ''),
      },
    });
  }

  async sendOTP(to: string, code: string): Promise<boolean> {
    try {
      await this.transporter.sendMail({
        from: '"Fun Pizza Kitchen" <verify@funpizzakitchen.com>',
        to,
        subject: 'Your Fun Pizza Kitchen Verification Code',
        html: this.getOTPTemplate(code),
      });
      this.logger.log('OTP sent to ' + to);
      return true;
    } catch (error) {
      this.logger.error('Failed to send OTP to ' + to + ': ' + error.message);
      return false;
    }
  }

  private getOTPTemplate(code: string): string {
    return \`
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; background: #F8F6F3;">
      <div style="background: #1C1612; border-radius: 16px; padding: 32px; text-align: center; margin-bottom: 24px;">
        <h1 style="color: #C8922A; font-size: 28px; margin: 0; letter-spacing: 3px;">FUN</h1>
        <p style="color: #F5EDE0; font-size: 14px; margin: 4px 0 0; letter-spacing: 5px;">PIZZA KITCHEN</p>
      </div>
      <div style="background: #FFFFFF; border-radius: 16px; padding: 32px; text-align: center;">
        <h2 style="color: #1C1612; font-size: 20px; margin: 0 0 8px;">Verify Your Email</h2>
        <p style="color: #6B5E52; font-size: 14px; margin: 0 0 24px; line-height: 1.5;">Enter this code in the app to verify your account.</p>
        <div style="background: #F8F6F3; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <span style="font-size: 36px; font-weight: 800; color: #1C1612; letter-spacing: 8px;">\${code}</span>
        </div>
        <p style="color: #A69A8E; font-size: 12px; margin: 0;">This code expires in 10 minutes. Don't share it with anyone.</p>
      </div>
      <p style="color: #A69A8E; font-size: 11px; text-align: center; margin-top: 24px;">Fun Pizza Kitchen Drinks Membership</p>
    </div>
    \`;
  }
}
`);

// ============================================================
// OTP Service — Generation, storage, verification, rate limiting
// ============================================================
writeFile('src/auth/otp.service.ts', `import { Injectable, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { EmailService } from './email.service';

// We'll store OTPs in a simple database table
// This is more reliable than Redis for this use case
import { OtpRecord } from './otp-record.entity';

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
    const normalizedEmail = email.toLowerCase().trim();

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

    this.logger.log('OTP generated for ' + normalizedEmail);
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
        
        this.logger.warn('Email blocked due to too many wrong OTP attempts: ' + normalizedEmail);
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

    this.logger.log('OTP verified for ' + normalizedEmail);
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
`);

// ============================================================
// OTP Record Entity
// ============================================================
writeFile('src/auth/otp-record.entity.ts', `import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('otp_records')
export class OtpRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  email: string;

  @Column({ type: 'varchar', length: 6 })
  code: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'wrong_attempts', type: 'integer', default: 0 })
  wrongAttempts: number;

  @Column({ default: false })
  used: boolean;

  @Column({ default: false })
  blocked: boolean;

  @Column({ name: 'blocked_until', type: 'timestamptz', nullable: true })
  blockedUntil: Date | null;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
`);

// ============================================================
// OTP Controller
// ============================================================
writeFile('src/auth/otp.controller.ts', `import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { OtpService } from './otp.service';

@Controller('auth/otp')
export class OtpController {
  constructor(private otpService: OtpService) {}

  /**
   * POST /api/auth/otp/send
   * Send a 6-digit OTP to the given email
   */
  @Post('send')
  @HttpCode(HttpStatus.OK)
  async sendOTP(@Body('email') email: string) {
    return this.otpService.sendOTP(email);
  }

  /**
   * POST /api/auth/otp/verify
   * Verify the OTP code for an email
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyOTP(@Body() body: { email: string; code: string }) {
    return this.otpService.verifyOTP(body.email, body.code);
  }
}
`);

// ============================================================
// Migration for OTP table
// ============================================================
writeFile('src/database/migrations/1712150500000-AddOtpRecords.ts', `import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOtpRecords1712150500000 implements MigrationInterface {
  name = 'AddOtpRecords1712150500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(\`
      CREATE TABLE "otp_records" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" varchar NOT NULL,
        "code" varchar(6) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "wrong_attempts" integer NOT NULL DEFAULT 0,
        "used" boolean NOT NULL DEFAULT false,
        "blocked" boolean NOT NULL DEFAULT false,
        "blocked_until" TIMESTAMP WITH TIME ZONE,
        "verified_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_otp_records" PRIMARY KEY ("id")
      )
    \`);
    await queryRunner.query(\`CREATE INDEX "IDX_otp_records_email" ON "otp_records" ("email")\`);
    await queryRunner.query(\`CREATE INDEX "IDX_otp_records_email_used" ON "otp_records" ("email", "used")\`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(\`DROP TABLE IF EXISTS "otp_records" CASCADE\`);
  }
}
`);

// ============================================================
// Update Auth Module — add OTP service, email service, controller
// ============================================================
writeFile('src/auth/auth.module.ts', `import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FirebaseService } from './firebase.service';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './auth.guards';
import { EmailService } from './email.service';
import { OtpService } from './otp.service';
import { OtpController } from './otp.controller';
import { OtpRecord } from './otp-record.entity';
import { User } from '../users/user.entity';
import { IdVerification } from '../verification/id-verification.entity';
import { Membership } from '../memberships/membership.entity';
import { BarcodeSecret } from '../barcode/barcode-secret.entity';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRY', '7d') },
      }),
    }),
    TypeOrmModule.forFeature([User, IdVerification, Membership, BarcodeSecret, OtpRecord]),
  ],
  controllers: [AuthController, OtpController],
  providers: [AuthService, FirebaseService, JwtStrategy, RolesGuard, EmailService, OtpService],
  exports: [AuthService, FirebaseService, JwtStrategy, RolesGuard],
})
export class AuthModule {}
`);

console.log('\\n\\u2705 Email verification backend ready!');
console.log('');
console.log('Next steps:');
console.log('  1. Add Mailgun credentials to your .env file');
console.log('  2. Run: npm run migration:run');
console.log('  3. Restart backend: npm run start:dev');
console.log('');
console.log('New API endpoints:');
console.log('  POST /api/auth/otp/send    - body: { email }');
console.log('  POST /api/auth/otp/verify  - body: { email, code }');
console.log('');
