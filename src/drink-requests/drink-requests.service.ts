import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DrinkRequest, DrinkRequestStatus } from './drink-request.entity';
import { User, UserRole } from '../users/user.entity';
import { NotificationsService } from '../notifications/notifications.service';

const COOLDOWN_MINUTES = 5;

@Injectable()
export class DrinkRequestsService {
  private readonly logger = new Logger(DrinkRequestsService.name);

  constructor(
    @InjectRepository(DrinkRequest) private requestRepo: Repository<DrinkRequest>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * Returns the user's currently in-flight request (pending or accepted), if any.
   * Only considers requests created in the last hour — older accepted requests
   * are assumed to be stale (drink already served, just never marked fulfilled).
   */
  async getActiveRequest(userId: string): Promise<DrinkRequest | null> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return this.requestRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'user')
      .leftJoinAndSelect('r.drinkItem', 'drinkItem')
      .leftJoinAndSelect('r.location', 'location')
      .leftJoinAndSelect('r.acceptedBy', 'acceptedBy')
      .where('r.userId = :userId', { userId })
      .andWhere('r.status IN (:...statuses)', {
        statuses: [DrinkRequestStatus.PENDING, DrinkRequestStatus.ACCEPTED],
      })
      .andWhere('r.createdAt > :oneHourAgo', { oneHourAgo })
      .orderBy('r.createdAt', 'DESC')
      .getOne();
  }

  /**
   * Cooldown check. New rule:
   *  - If user has a pending or accepted request → they cannot request another (status screen)
   *  - If their last drink was FULFILLED < 15 min ago → cooldown active
   *  - Otherwise → can request
   */
  async getCooldownStatus(userId: string): Promise<{
    canRequest: boolean;
    secondsRemaining: number;
    nextAvailableAt: Date | null;
    activeRequestId?: string;
  }> {
    // 1) Is there a request still in flight (pending/accepted)?
    const active = await this.getActiveRequest(userId);
    if (active) {
      return {
        canRequest: false,
        secondsRemaining: 0,
        nextAvailableAt: null,
        activeRequestId: active.id,
      };
    }

    // 2) Was the last FULFILLED drink within the cooldown window?
    const lastFulfilled = await this.requestRepo.findOne({
      where: { userId, status: DrinkRequestStatus.FULFILLED },
      order: { fulfilledAt: 'DESC' },
    });

    if (!lastFulfilled || !lastFulfilled.fulfilledAt) {
      return { canRequest: true, secondsRemaining: 0, nextAvailableAt: null };
    }

    const cooldownMs = COOLDOWN_MINUTES * 60 * 1000;
    const elapsed = Date.now() - lastFulfilled.fulfilledAt.getTime();
    const remaining = cooldownMs - elapsed;

    if (remaining <= 0) return { canRequest: true, secondsRemaining: 0, nextAvailableAt: null };

    return {
      canRequest: false,
      secondsRemaining: Math.ceil(remaining / 1000),
      nextAvailableAt: new Date(lastFulfilled.fulfilledAt.getTime() + cooldownMs),
    };
  }

  /**
   * Mark any in-flight request as fulfilled for this user — called when the staff
   * scans the rolling drink barcode (i.e., drink is being served).
   * Returns true if a request was marked fulfilled.
   */
  async markFulfilledOnBarcodeScan(userId: string): Promise<boolean> {
    const active = await this.requestRepo.findOne({
      where: [
        { userId, status: DrinkRequestStatus.PENDING },
        { userId, status: DrinkRequestStatus.ACCEPTED },
      ],
      order: { createdAt: 'DESC' },
    });
    if (!active) return false;

    active.status = DrinkRequestStatus.FULFILLED;
    active.fulfilledAt = new Date();
    await this.requestRepo.save(active);
    this.logger.log(`Drink request ${active.id} marked fulfilled (barcode scanned)`);
    return true;
  }

  /** Create a drink request (members only, enforces cooldown) */
  async createRequest(
    userId: string,
    locationId: string,
    drinkItemId: string,
    tableNumber: number,
  ): Promise<DrinkRequest> {
    const membershipCheck = await this.requestRepo.query(
      `SELECT COUNT(*) FROM memberships WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()`,
      [userId],
    );
    if (parseInt(membershipCheck[0].count) === 0) {
      throw new ForbiddenException('Active membership required to request drinks.');
    }

    const cooldown = await this.getCooldownStatus(userId);
    if (!cooldown.canRequest) {
      throw new BadRequestException({
        message: 'Cooldown active',
        secondsRemaining: cooldown.secondsRemaining,
        nextAvailableAt: cooldown.nextAvailableAt,
      });
    }

    const request = this.requestRepo.create({
      userId, locationId, drinkItemId, tableNumber,
      status: DrinkRequestStatus.PENDING,
    });
    await this.requestRepo.save(request);

    // Load full relations for the push notification
    const full = await this.requestRepo.findOne({
      where: { id: request.id },
      relations: ['user', 'drinkItem', 'location'],
    });

    if (full) {
      const tokens = await this.notificationsService.getStaffTokensForLocation(locationId);
      if (tokens.length > 0) {
        await this.notificationsService.sendPushNotifications(
          tokens,
          '🍺 Drink Request',
          `Table ${tableNumber} • ${full.drinkItem.name} — ${full.user.fullName}`,
          { type: 'drink_request', requestId: request.id, locationId },
        );
      }
    }

    this.logger.log(`Drink request created: user=${userId} table=${tableNumber} drink=${drinkItemId}`);
    return full!;
  }

  /** Accept a request (staff/manager/owner only) */
  async acceptRequest(requestId: string, staffId: string): Promise<DrinkRequest> {
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
      relations: ['user', 'drinkItem', 'location', 'acceptedBy'],
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status === DrinkRequestStatus.ACCEPTED) {
      return request; // already accepted — return current state with acceptedBy info
    }

    request.status = DrinkRequestStatus.ACCEPTED;
    request.acceptedById = staffId;
    request.acceptedAt = new Date();
    await this.requestRepo.save(request);

    return this.requestRepo.findOne({
      where: { id: requestId },
      relations: ['user', 'drinkItem', 'location', 'acceptedBy'],
    }) as Promise<DrinkRequest>;
  }

  /** Get all requests at a location (staff view) */
  async getRequestsForLocation(locationId: string): Promise<DrinkRequest[]> {
    return this.requestRepo.find({
      where: { locationId },
      relations: ['user', 'drinkItem', 'acceptedBy'],
      order: { createdAt: 'DESC' },
    });
  }

  /** Fetch a single request — only the requesting user can read it through this endpoint. */
  async getRequestForUser(requestId: string, userId: string): Promise<DrinkRequest> {
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
      relations: ['user', 'drinkItem', 'location', 'acceptedBy'],
    });
    if (!request) throw new NotFoundException('Request not found');
    if (request.userId !== userId) {
      throw new ForbiddenException('Not your request');
    }
    return request;
  }
}
