import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { VerificationService } from './verification.service';
import { Auth, AuthRoles, CurrentUser } from '../auth/auth.guards';
import { User, UserRole } from '../users/user.entity';
import { IdType } from './id-verification.entity';

@Controller('verifications')
export class VerificationController {
  constructor(private verificationService: VerificationService) {}

  /**
   * GET /verifications/me — User checks their own verification status
   */
  @Get('me')
  @Auth()
  getMyVerification(@CurrentUser() user: User) {
    return this.verificationService.getVerificationForUser(user.id);
  }

  /**
   * GET /verifications/pending — Staff/Admin: get pending ID verification queue
   */
  @Get('pending')
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER, UserRole.STAFF)
  getPendingVerifications() {
    return this.verificationService.getPendingVerifications();
  }

  /**
   * POST /verifications/:id/approve — Staff approves an ID
   * Body: { idPhotoUrl, idType, idDateOfBirth }
   */
  @Post(':id/approve')
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER, UserRole.STAFF)
  approveVerification(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() staff: User,
    @Body() body: { idPhotoUrl: string; idType: IdType; idDateOfBirth: string },
  ) {
    return this.verificationService.approveVerification(id, staff.id, {
      idPhotoUrl: body.idPhotoUrl,
      idType: body.idType,
      idDateOfBirth: new Date(body.idDateOfBirth),
    });
  }

  /**
   * POST /verifications/:id/reject — Staff rejects an ID
   * Body: { reason }
   */
  @Post(':id/reject')
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER, UserRole.STAFF)
  rejectVerification(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() staff: User,
    @Body('reason') reason: string,
  ) {
    return this.verificationService.rejectVerification(id, staff.id, reason);
  }
}
