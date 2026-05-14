import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DrinksController } from './drinks.controller';
import { DrinksService } from './drinks.service';
import { DrinkMenuItem } from './drink-menu-item.entity';
import { LocationDrink } from './location-drink.entity';
import { DrinkLog } from './drink-log.entity';
import { DrinkLimitConfig } from './drink-limit-config.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DrinkMenuItem, LocationDrink, DrinkLog, DrinkLimitConfig]),
    AuthModule, // for FirebaseService
  ],
  controllers: [DrinksController],
  providers: [DrinksService],
  exports: [DrinksService],
})
export class DrinksModule {}
