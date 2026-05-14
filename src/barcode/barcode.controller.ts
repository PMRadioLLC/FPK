import { Controller, Get, Post, Body } from '@nestjs/common';
import { BarcodeService } from './barcode.service';
import { Auth, AuthRoles, CurrentUser } from '../auth/auth.guards';
import { User, UserRole } from '../users/user.entity';

@Controller('barcode')
export class BarcodeController {
  constructor(private barcodeService: BarcodeService) {}

  /**
   * GET /barcode — Member gets their current rotating barcode
   * The mobile app calls this every 30 seconds.
   */
  @Get()
  @Auth()
  generateBarcode(@CurrentUser() user: User) {
    return this.barcodeService.generateBarcode(user.id);
  }

  /**
   * POST /barcode/scan — Staff scans a member's barcode
   * Body: { qrPayload, locationId }
   */
  @Post('scan')
  @AuthRoles(UserRole.STAFF, UserRole.MANAGER, UserRole.OWNER)
  scanBarcode(
    @CurrentUser() staff: User,
    @Body() body: { qrPayload: string; locationId: string },
  ) {
    return this.barcodeService.validateBarcode(
      body.qrPayload,
      staff.id,
      body.locationId,
    );
  }
}
