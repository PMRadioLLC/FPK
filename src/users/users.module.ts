import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { BarcodeSecret } from '../barcode/barcode-secret.entity';
import { Membership } from '../memberships/membership.entity';
import { DrinkRequest } from '../drink-requests/drink-request.entity';
import { IdVerification } from '../verification/id-verification.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, BarcodeSecret, Membership, DrinkRequest, IdVerification]),
    AuthModule, // Provides FirebaseService (the initialized one)
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
