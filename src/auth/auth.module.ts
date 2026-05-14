import { Module } from '@nestjs/common';
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
