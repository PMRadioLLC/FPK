import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { FirebaseLoginDto, RegisterDto, AuthResponseDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * POST /auth/login
   * Called when an existing user signs in via Firebase (Google/Apple/Email).
   * The mobile app sends us the Firebase ID token.
   *
   * Returns: JWT + user profile with membership/verification status.
   * Error: 401 with code "NO_ACCOUNT" if user doesn't exist → app shows sign-up.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: FirebaseLoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto.firebaseIdToken);
  }

  /**
   * POST /auth/register
   * Called when a new user creates an account.
   * Firebase token + profile info (name, DOB).
   *
   * - Checks age >= 21
   * - Creates user with status "pending"
   * - Creates pending ID verification record
   * - Generates barcode secret
   * - Returns JWT + user profile
   */
  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }
}
