import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
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
