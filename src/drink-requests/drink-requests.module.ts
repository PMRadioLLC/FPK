import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DrinkRequest } from './drink-request.entity';
import { User } from '../users/user.entity';
import { DrinkRequestsService } from './drink-requests.service';
import { DrinkRequestsController } from './drink-requests.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([DrinkRequest, User]), NotificationsModule],
  controllers: [DrinkRequestsController],
  providers: [DrinkRequestsService],
  exports: [DrinkRequestsService],
})
export class DrinkRequestsModule {}
