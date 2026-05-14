import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';
import { Membership } from './membership.entity';
import { User } from '../users/user.entity';
import { PromoCode } from '../payments/promo-code.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Membership, User, PromoCode])],
  controllers: [MembershipsController],
  providers: [MembershipsService],
  exports: [MembershipsService],
})
export class MembershipsModule {}
