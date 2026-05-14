import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { Auth, AuthRoles, CurrentUser } from '../auth/auth.guards';
import { User, UserRole } from './user.entity';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  /**
   * GET /users/me — Get current user's profile
   */
  @Get('me')
  @Auth()
  getProfile(@CurrentUser() user: User) {
    return user;
  }

  /**
   * PUT /users/me/selfie — Upload a selfie from base64 (server-side upload).
   * Body: { selfieBase64: string }
   */
  @Put('me/selfie')
  @Auth()
  updateSelfie(
    @CurrentUser() user: User,
    @Body('selfieBase64') selfieBase64: string,
  ) {
    return this.usersService.updateSelfieFromBase64(user.id, selfieBase64);
  }

  /**
   * GET /users — Admin: list all members (paginated)
   */
  @Get()
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER)
  listUsers(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.usersService.getAllMembers(+page, +limit);
  }

  /**
   * GET /users/search?q=john — Admin: search users
   */
  @Get('search')
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER)
  searchUsers(@Query('q') query: string) {
    return this.usersService.searchUsers(query);
  }

  /**
   * PUT /users/:id/ban — Admin: ban a user
   */
  @Put(':id/ban')
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER)
  banUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.banUser(id);
  }

  /**
   * PUT /users/:id/unban — Admin: unban a user
   */
  @Put(':id/unban')
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER)
  unbanUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.unbanUser(id);
  }

  /**
   * POST /users/lookup — Owner/Manager scans a member QR; returns full profile + history.
   */
  @Post('lookup')
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER)
  lookupByQrPayload(@Body('qrPayload') qrPayload: string) {
    return this.usersService.lookupByQrPayload(qrPayload);
  }

  /**
   * POST /users/:id/verify — Owner/Manager marks a user as ID-verified.
   * Body: { idPhotoBase64: string } — backend uploads photo server-side.
   */
  @Post(':id/verify')
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER)
  verifyUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() verifier: User,
    @Body('idPhotoBase64') idPhotoBase64: string,
  ) {
    return this.usersService.verifyUser(id, verifier.id, idPhotoBase64);
  }
}
