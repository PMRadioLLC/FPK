import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { BarcodeSecret } from './barcode-secret.entity';
import { Membership, MembershipStatus } from '../memberships/membership.entity';
import { DrinkLog } from '../drinks/drink-log.entity';
import { DrinkLimitConfig } from '../drinks/drink-limit-config.entity';
import { User, UserStatus } from '../users/user.entity';
import { DrinkRequestsService } from '../drink-requests/drink-requests.service';

export interface BarcodeData {
  qrPayload: string;           // The string to encode as QR code
  memberId: string;
  memberName: string;
  selfieUrl: string | null;
  membershipPlan: string;
  expiresAt: string;
  drinksToday: number;
  nextDrinkAvailable: string | null;  // ISO timestamp or null if available now
  barcodeExpiresIn: number;           // seconds until this barcode expires
}

export interface ScanResult {
  valid: boolean;
  memberId: string;
  memberName: string;
  selfieUrl: string | null;
  idPhotoUrl: string | null;
  isVerified: boolean;
  membershipPlan: string;
  drinksToday: number;
  error?: string;
  nextDrinkAvailable?: string;
}

@Injectable()
export class BarcodeService {
  private readonly logger = new Logger(BarcodeService.name);
  private readonly rotationSeconds: number;

  constructor(
    @InjectRepository(BarcodeSecret)
    private secretRepo: Repository<BarcodeSecret>,
    @InjectRepository(Membership)
    private membershipRepo: Repository<Membership>,
    @InjectRepository(DrinkLog)
    private drinkLogRepo: Repository<DrinkLog>,
    @InjectRepository(DrinkLimitConfig)
    private limitConfigRepo: Repository<DrinkLimitConfig>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private configService: ConfigService,
    private drinkRequestsService: DrinkRequestsService,
  ) {
    this.rotationSeconds = parseInt(
      this.configService.get('BARCODE_ROTATION_SECONDS', '30'),
    );
  }

  // ==========================================
  // GENERATE — called by the member's app every 30s
  // ==========================================
  async generateBarcode(userId: string): Promise<BarcodeData> {
    // 1. Get user + their secret
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const secret = await this.secretRepo.findOne({ where: { userId } });
    if (!secret) throw new NotFoundException('Barcode secret not found');

    // 2. Get active membership
    const membership = await this.membershipRepo.findOne({
      where: { userId, status: MembershipStatus.ACTIVE },
    });
    if (!membership) {
      throw new BadRequestException('No active membership found');
    }

    // 3. Get today's drink count
    const drinksToday = await this.getDrinksToday(userId);

    // 4. Check drink limits
    const nextDrinkAvailable = await this.getNextDrinkAvailability(userId);

    // 5. Generate the TOTP token
    const timeWindow = Math.floor(Date.now() / (this.rotationSeconds * 1000));
    const payload = `${userId}:${timeWindow}`;
    const token = crypto
      .createHmac('sha256', secret.secretKey)
      .update(payload)
      .digest('hex');

    // 6. Build the QR payload (this is what gets encoded in the QR code)
    //    Format: userId|token|timestamp
    const qrPayload = `FPK:${userId}:${token}:${Date.now()}`;

    // 7. Calculate seconds until this barcode expires
    const currentWindowStart = timeWindow * this.rotationSeconds * 1000;
    const nextWindowStart = currentWindowStart + this.rotationSeconds * 1000;
    const barcodeExpiresIn = Math.ceil((nextWindowStart - Date.now()) / 1000);

    return {
      qrPayload,
      memberId: userId,
      memberName: user.fullName,
      selfieUrl: user.selfieUrl,
      membershipPlan: membership.plan,
      expiresAt: membership.expiresAt.toISOString(),
      drinksToday,
      nextDrinkAvailable,
      barcodeExpiresIn,
    };
  }

  // ==========================================
  // VALIDATE — called when staff scans the barcode
  // ==========================================
  async validateBarcode(
    qrPayload: string,
    staffId: string,
    locationId: string,
  ): Promise<ScanResult> {
    // 1. Parse the QR payload
    const parts = qrPayload.split(':');
    if (parts.length !== 4 || parts[0] !== 'FPK') {
      return this.failResult('Invalid barcode format');
    }

    const [, userId, token] = parts;

    // 2. Get the user
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return this.failResult('Member not found');
    if (user.status === UserStatus.BANNED) {
      return this.failResult('Account has been banned', user);
    }

    // 3. Get their secret
    const secret = await this.secretRepo.findOne({ where: { userId } });
    if (!secret) return this.failResult('Invalid barcode', user);

    // 4. Verify the TOTP token (check current window AND previous window for grace period)
    const currentWindow = Math.floor(Date.now() / (this.rotationSeconds * 1000));
    let tokenValid = false;

    for (const window of [currentWindow, currentWindow - 1]) {
      const expectedPayload = `${userId}:${window}`;
      const expectedToken = crypto
        .createHmac('sha256', secret.secretKey)
        .update(expectedPayload)
        .digest('hex');

      if (token === expectedToken) {
        tokenValid = true;
        break;
      }
    }

    if (!tokenValid) {
      return this.failResult('Barcode has expired — ask member to refresh', user);
    }

    // 5. Check membership is active
    const membership = await this.membershipRepo.findOne({
      where: { userId, status: MembershipStatus.ACTIVE },
    });
    if (!membership) {
      return this.failResult('No active membership', user);
    }
    if (new Date() > membership.expiresAt) {
      return this.failResult('Membership has expired', user);
    }

    // 6. Check drink limits
    const drinksToday = await this.getDrinksToday(userId);
    const limitCheck = await this.checkDrinkLimits(userId, locationId, drinksToday);
    if (!limitCheck.allowed) {
      return {
        valid: false,
        memberId: userId,
        memberName: user.fullName,
        selfieUrl: user.selfieUrl,
        idPhotoUrl: user.idPhotoUrl,
        isVerified: user.status === UserStatus.VERIFIED,
        membershipPlan: membership.plan,
        drinksToday,
        error: limitCheck.reason,
        nextDrinkAvailable: limitCheck.nextAvailable,
      };
    }

    // 7. Log the drink
    const drinkLog = this.drinkLogRepo.create({
      userId,
      locationId,
      staffId,
      barcodeTokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    });
    await this.drinkLogRepo.save(drinkLog);

    // 8. If they had an in-flight drink request, mark it fulfilled — this is what
    //    actually starts the 15-min cooldown window in the new flow.
    try {
      await this.drinkRequestsService.markFulfilledOnBarcodeScan(userId);
    } catch (err) {
      this.logger.warn('Could not mark drink_request as fulfilled: ' + (err as any)?.message);
    }

    this.logger.log(`Drink served: user=${userId} location=${locationId} staff=${staffId}`);

    return {
      valid: true,
      memberId: userId,
      memberName: user.fullName,
      selfieUrl: user.selfieUrl,
      idPhotoUrl: user.idPhotoUrl,
      isVerified: user.status === UserStatus.VERIFIED,
      membershipPlan: membership.plan,
      drinksToday: drinksToday + 1,
    };
  }

  // ==========================================
  // HELPERS
  // ==========================================

  private async getDrinksToday(userId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    return this.drinkLogRepo
      .createQueryBuilder('log')
      .where('log.user_id = :userId', { userId })
      .andWhere('log.scanned_at >= :startOfDay', { startOfDay })
      .getCount();
  }

  private async getNextDrinkAvailability(userId: string): Promise<string | null> {
    // Get the most recent drink log
    const lastDrink = await this.drinkLogRepo.findOne({
      where: { userId },
      order: { scannedAt: 'DESC' },
    });

    if (!lastDrink) return null; // No drinks yet — available now

    // Check if there's a cooldown configured (check all locations, use most restrictive)
    const configs = await this.limitConfigRepo.find({ where: { isActive: true } });
    const activeCooldowns = configs.filter(c => !c.isUnlimited && c.cooldownMinutes > 0);

    if (activeCooldowns.length === 0) return null; // No cooldown

    const maxCooldown = Math.max(...activeCooldowns.map(c => c.cooldownMinutes));
    const cooldownEnd = new Date(lastDrink.scannedAt.getTime() + maxCooldown * 60 * 1000);

    if (cooldownEnd > new Date()) {
      return cooldownEnd.toISOString();
    }

    return null; // Cooldown has passed
  }

  private async checkDrinkLimits(
    userId: string,
    locationId: string,
    drinksToday: number,
  ): Promise<{ allowed: boolean; reason?: string; nextAvailable?: string }> {
    // Check location-specific config first, fall back to any active config
    let config = await this.limitConfigRepo.findOne({
      where: { locationId, isActive: true },
    });

    if (!config) {
      // No config for this location — unlimited by default
      return { allowed: true };
    }

    if (config.isUnlimited) {
      return { allowed: true };
    }

    // Check daily limit
    if (config.maxDrinksPerDay > 0 && drinksToday >= config.maxDrinksPerDay) {
      return {
        allowed: false,
        reason: `Daily limit reached (${config.maxDrinksPerDay} drinks). Resets at midnight.`,
      };
    }

    // Check cooldown
    if (config.cooldownMinutes > 0) {
      const lastDrink = await this.drinkLogRepo.findOne({
        where: { userId },
        order: { scannedAt: 'DESC' },
      });

      if (lastDrink) {
        const cooldownEnd = new Date(
          lastDrink.scannedAt.getTime() + config.cooldownMinutes * 60 * 1000,
        );
        if (cooldownEnd > new Date()) {
          const minutesLeft = Math.ceil((cooldownEnd.getTime() - Date.now()) / 60000);
          return {
            allowed: false,
            reason: `Cooldown active. Next drink in ${minutesLeft} minutes.`,
            nextAvailable: cooldownEnd.toISOString(),
          };
        }
      }
    }

    return { allowed: true };
  }

  private failResult(error: string, user?: User): ScanResult {
    return {
      valid: false,
      memberId: user?.id || '',
      memberName: user?.fullName || 'Unknown',
      selfieUrl: user?.selfieUrl || null,
      idPhotoUrl: user?.idPhotoUrl || null,
      isVerified: user?.status === UserStatus.VERIFIED,
      membershipPlan: '',
      drinksToday: 0,
      error,
    };
  }
}
