import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
} from '@nestjs/common';
import { DrinksService } from './drinks.service';
import { Auth, AuthRoles, CurrentUser } from '../auth/auth.guards';
import { User, UserRole } from '../users/user.entity';
import { DrinkCategory } from './drink-menu-item.entity';

@Controller('drinks')
export class DrinksController {
  constructor(private drinksService: DrinksService) {}

  // ==================== MENU ====================

  /** GET /drinks/menu — Get all menu items */
  @Get('menu')
  @Auth()
  getMenu() {
    return this.drinksService.getAllMenuItems();
  }

  /** POST /drinks/menu — Admin: add a new menu item */
  @Post('menu')
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER)
  createMenuItem(
    @Body() body: { name: string; category: DrinkCategory; description?: string; photoUrl?: string },
  ) {
    return this.drinksService.createMenuItem(body);
  }

  /** PUT /drinks/menu/:id — Admin: update a menu item */
  @Put('menu/:id')
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER)
  updateMenuItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Partial<{ name: string; category: DrinkCategory; description: string; photoUrl: string; isActive: boolean }>,
  ) {
    return this.drinksService.updateMenuItem(id, body);
  }

  /** DELETE /drinks/menu/:id — Admin: remove a menu item */
  @Delete('menu/:id')
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER)
  @HttpCode(204)
  deleteMenuItem(@Param('id', ParseUUIDPipe) id: string) {
    return this.drinksService.deleteMenuItem(id);
  }

  /** POST /drinks/menu/:id/photo — Admin: upload a photo for a menu item */
  @Post('menu/:id/photo')
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER)
  uploadPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('photoBase64') photoBase64: string,
  ) {
    return this.drinksService.uploadPhotoFromBase64(id, photoBase64);
  }

  // ==================== LOCATION AVAILABILITY ====================

  /** GET /drinks/location/:locationId — Get available drinks at a location */
  @Get('location/:locationId')
  @Auth()
  getLocationDrinks(@Param('locationId', ParseUUIDPipe) locationId: string) {
    return this.drinksService.getDrinksForLocation(locationId);
  }

  /** PUT /drinks/location/:locationId/:drinkId — Admin: toggle drink availability */
  @Put('location/:locationId/:drinkId')
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER)
  setDrinkAvailability(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('drinkId', ParseUUIDPipe) drinkId: string,
    @Body('isAvailable') isAvailable: boolean,
  ) {
    return this.drinksService.setDrinkAvailability(locationId, drinkId, isAvailable);
  }

  // ==================== LOGS ====================

  /** GET /drinks/logs/me — Member: my drink history */
  @Get('logs/me')
  @Auth()
  getMyLogs(
    @CurrentUser() user: User,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.drinksService.getDrinkLogsForUser(user.id, +page, +limit);
  }

  /** GET /drinks/logs/location/:locationId — Admin: drinks served at location */
  @Get('logs/location/:locationId')
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER)
  getLocationLogs(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query('date') date?: string,
  ) {
    return this.drinksService.getDrinkLogsForLocation(locationId, date);
  }

  // ==================== LIMITS ====================

  /** GET /drinks/limits/:locationId — Get drink limit config */
  @Get('limits/:locationId')
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER)
  getLimitConfig(@Param('locationId', ParseUUIDPipe) locationId: string) {
    return this.drinksService.getLimitConfig(locationId);
  }

  /** PUT /drinks/limits/:locationId — Admin: update drink limits */
  @Put('limits/:locationId')
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER)
  updateLimitConfig(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() body: { maxDrinksPerDay?: number; cooldownMinutes?: number; isUnlimited?: boolean },
  ) {
    return this.drinksService.updateLimitConfig(locationId, body);
  }
}
