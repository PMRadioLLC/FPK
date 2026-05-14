import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BarcodeController } from './barcode.controller';
import { BarcodeService } from './barcode.service';
import { BarcodeSecret } from './barcode-secret.entity';
import { Membership } from '../memberships/membership.entity';
import { DrinkLog } from '../drinks/drink-log.entity';
import { DrinkLimitConfig } from '../drinks/drink-limit-config.entity';
import { User } from '../users/user.entity';
import { DrinkRequestsModule } from '../drink-requests/drink-requests.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BarcodeSecret,
      Membership,
      DrinkLog,
      DrinkLimitConfig,
      User,
    ]),
    DrinkRequestsModule,
  ],
  controllers: [BarcodeController],
  providers: [BarcodeService],
  exports: [BarcodeService],
})
export class BarcodeModule {}
