import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { Auth, AuthRoles, CurrentUser } from '../auth/auth.guards';
import { User, UserRole } from '../users/user.entity';

@Controller('memberships')
export class MembershipsController {
  constructor(private membershipsService: MembershipsService) {}

  /** GET /memberships/plans — Get available plans with pricing */
  @Get('plans')
  getPlans() {
    return this.membershipsService.getAvailablePlans();
  }

  /** GET /memberships/me — Get my active membership */
  @Get('me')
  @Auth()
  getMyMembership(@CurrentUser() user: User) {
    return this.membershipsService.getActiveMembership(user.id);
  }

  /** GET /memberships/me/history — Get my membership history */
  @Get('me/history')
  @Auth()
  getMyHistory(@CurrentUser() user: User) {
    return this.membershipsService.getMembershipHistory(user.id);
  }

  /** PUT /memberships/me/cancel-renewal — Cancel auto-renewal */
  @Put('me/cancel-renewal')
  @Auth()
  cancelAutoRenew(@CurrentUser() user: User) {
    return this.membershipsService.cancelAutoRenew(user.id);
  }

  /** POST /memberships/validate-promo — Check if a promo code is valid */
  @Post('validate-promo')
  @Auth()
  validatePromo(@Body('code') code: string) {
    return this.membershipsService.validatePromoCode(code);
  }

  /** PUT /memberships/:id/revoke — Admin: revoke a membership */
  @Put(':id/revoke')
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER)
  revokeMembership(@Param('id', ParseUUIDPipe) id: string) {
    return this.membershipsService.revokeMembership(id);
  }
}
