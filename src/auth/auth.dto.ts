import { IsString, IsNotEmpty, IsDateString, IsEmail, IsOptional, MinLength, MaxLength, Matches } from 'class-validator';

// Firebase ID tokens are large JWTs (typically 1-2KB). Cap generously to
// stop an attacker submitting megabytes of garbage to exhaust the verifier.
const MAX_FIREBASE_TOKEN = 4096;

/**
 * Sent by the mobile app after Firebase sign-in.
 * The app sends us the Firebase ID token, and we
 * either find the existing user or create a new one.
 */
export class FirebaseLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_FIREBASE_TOKEN)
  firebaseIdToken: string;
}

/**
 * Sent during first-time registration.
 * The Firebase ID token proves they authenticated,
 * and we collect additional profile info.
 *
 * All string fields have length caps to prevent huge-input DoS.
 */
export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_FIREBASE_TOKEN)
  firebaseIdToken: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @IsDateString()
  @MaxLength(32)
  dateOfBirth: string;

  @IsOptional()
  @IsString()
  // E.164 phone numbers are at most 15 digits; allow a bit of slack for
  // formatting characters like spaces, dashes, parentheses, and the leading +.
  @MaxLength(20)
  @Matches(/^[+\d\s\-()]*$/, { message: 'phone must contain only digits and +-() ' })
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
