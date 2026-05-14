import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DrinksController } from './drinks.controller';
import { DrinksService } from './drinks.service';
import { DrinkMenuItem } from './drink-menu-item.entity';
import { LocationDrink } from './location-drink.entity';
import { DrinkLog } from './drink-log.entity';
import { DrinkLimitConfig } from './drink-limit-config.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([DrinkMenuItem, LocationDrink, DrinkLog, DrinkLimitConfig]),
  ],
  controllers: [DrinksController],
  providers: [DrinksService],
  exports: [DrinksService],
})
export class DrinksModule {}
