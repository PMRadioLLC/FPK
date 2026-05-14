import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';
import { IdVerification } from './id-verification.entity';
import { User } from '../users/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([IdVerification, User])],
  controllers: [VerificationController],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationModule {}
