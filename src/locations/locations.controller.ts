import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { LocationsService } from './locations.service';
import { Auth, AuthRoles, CurrentUser } from '../auth/auth.guards';
import { User, UserRole } from '../users/user.entity';
import { StaffRole } from './staff-assignment.entity';

@Controller('locations')
export class LocationsController {
  constructor(private locationsService: LocationsService) {}

  /** GET /locations — All active locations */
  @Get()
  @Auth()
  getAllLocations() {
    return this.locationsService.getAllLocations();
  }

  /**
   * GET /locations/my/assignments — Staff: get my assigned locations
   *
   * IMPORTANT: this MUST be declared before `@Get(':id')` so the literal
   * `my/assignments` route matches before being treated as a UUID param.
   */
  @Get('my/assignments')
  @Auth()
  getMyLocations(@CurrentUser() user: User) {
    return this.locationsService.getStaffLocations(user.id);
  }

  /** GET /locations/:id — Single location details */
  @Get(':id')
  @Auth()
  getLocation(@Param('id', ParseUUIDPipe) id: string) {
    return this.locationsService.getLocationById(id);
  }

  /** POST /locations — Owner: create a location */
  @Post()
  @AuthRoles(UserRole.OWNER)
  createLocation(
    @Body() body: { name: string; address: string; city: string; state: string; zip: string },
  ) {
    return this.locationsService.createLocation(body);
  }

  /** PUT /locations/:id — Owner: update a location */
  @Put(':id')
  @AuthRoles(UserRole.OWNER)
  updateLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Partial<{ name: string; address: string; city: string; state: string; zip: string; isActive: boolean }>,
  ) {
    return this.locationsService.updateLocation(id, body);
  }

  // ==================== STAFF ====================

  /** GET /locations/:id/staff — Get staff assigned to a location */
  @Get(':id/staff')
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER)
  getStaff(@Param('id', ParseUUIDPipe) id: string) {
    return this.locationsService.getStaffForLocation(id);
  }

  /** POST /locations/:id/staff — Assign staff to a location */
  @Post(':id/staff')
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER)
  assignStaff(
    @Param('id', ParseUUIDPipe) locationId: string,
    @Body() body: { userId: string; role: StaffRole },
  ) {
    return this.locationsService.assignStaff(body.userId, locationId, body.role);
  }

  /** DELETE /locations/:id/staff/:assignmentId — Remove staff assignment */
  @Delete(':id/staff/:assignmentId')
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER)
  removeStaff(@Param('assignmentId', ParseUUIDPipe) assignmentId: string) {
    return this.locationsService.removeStaffAssignment(assignmentId);
  }
}
