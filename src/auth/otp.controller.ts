import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OtpService } from './otp.service';

@Controller('auth/otp')
export class OtpController {
  constructor(private otpService: OtpService) {}

  /**
   * POST /api/auth/otp/send
   * Send a 6-digit OTP to the given email
   * Tightly rate-limited to prevent email-spam abuse via Mailgun.
   */
  @Post('send')
  @HttpCode(HttpStatus.OK)
  @Throttle({ strict: { limit: 3, ttl: 60_000 } })
  async sendOTP(@Body('email') email: string) {
    return this.otpService.sendOTP(email);
  }

  /**
   * POST /api/auth/otp/verify
   * Verify the OTP code for an email.
   * Note: otp.service.ts also enforces 2-wrong-attempts → 10-min block.
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ strict: { limit: 10, ttl: 60_000 } })
  async verifyOTP(@Body() body: { email: string; code: string }) {
    return this.otpService.verifyOTP(body.email, body.code);
  }
}
