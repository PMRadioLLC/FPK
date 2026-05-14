import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { User } from '../users/user.entity';
import { Payment } from '../payments/payment.entity';
import { Location } from '../locations/location.entity';
import { PromoCode } from '../payments/promo-code.entity';
import { DrinkLog } from '../drinks/drink-log.entity';
import { DrinkRequest } from '../drink-requests/drink-request.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Payment, Location, PromoCode, DrinkLog, DrinkRequest]),
    AuthModule,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
