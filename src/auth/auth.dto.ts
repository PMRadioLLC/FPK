import { IsString, IsNotEmpty, IsDateString, IsEmail, IsOptional, MinLength } from 'class-validator';

/**
 * Sent by the mobile app after Firebase sign-in.
 * The app sends us the Firebase ID token, and we
 * either find the existing user or create a new one.
 */
export class FirebaseLoginDto {
  @IsString()
  @IsNotEmpty()
  firebaseIdToken: string;
}

/**
 * Sent during first-time registration.
 * The Firebase ID token proves they authenticated,
 * and we collect additional profile info.
 */
export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  firebaseIdToken: string;

  @IsString()
  @MinLength(2)
  fullName: string;

  @IsDateString()
  dateOfBirth: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

/**
 * Response after successful login or registration.
 */
export class AuthResponseDto {
  accessToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    status: string;
    selfieUrl: string | null;
    hasActiveMembership: boolean;
    isVerified: boolean;
  };
}
