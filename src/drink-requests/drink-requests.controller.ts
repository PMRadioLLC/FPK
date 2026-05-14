import { Controller, Post, Put, Get, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { DrinkRequestsService } from './drink-requests.service';
import { Auth, AuthRoles, CurrentUser } from '../auth/auth.guards';
import { User, UserRole } from '../users/user.entity';

@Controller('drink-requests')
export class DrinkRequestsController {
  constructor(private drinkRequestsService: DrinkRequestsService) {}

  /** GET /drink-requests/cooldown — Check my cooldown status */
  @Get('cooldown')
  @Auth()
  getCooldown(@CurrentUser() user: User) {
    return this.drinkRequestsService.getCooldownStatus(user.id);
  }

  /** GET /drink-requests/active — Returns my current in-flight request (pending/accepted) or null */
  @Get('active')
  @Auth()
  getActive(@CurrentUser() user: User) {
    return this.drinkRequestsService.getActiveRequest(user.id);
  }

  /** POST /drink-requests — Submit a drink request */
  @Post()
  @Auth()
  createRequest(
    @CurrentUser() user: User,
    @Body() body: { locationId: string; drinkItemId: string; tableNumber: number },
  ) {
    return this.drinkRequestsService.createRequest(
      user.id,
      body.locationId,
      body.drinkItemId,
      body.tableNumber,
    );
  }

  /** PUT /drink-requests/:id/accept — Staff accept a request */
  @Put(':id/accept')
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER, UserRole.STAFF)
  acceptRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.drinkRequestsService.acceptRequest(id, user.id);
  }

  /** GET /drink-requests/location/:locationId — Staff: see all requests */
  @Get('location/:locationId')
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER, UserRole.STAFF)
  getRequests(@Param('locationId', ParseUUIDPipe) locationId: string) {
    return this.drinkRequestsService.getRequestsForLocation(locationId);
  }

  /** GET /drink-requests/:id — User polls status of their own request */
  @Get(':id')
  @Auth()
  getOwnRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.drinkRequestsService.getRequestForUser(id, user.id);
  }
}
