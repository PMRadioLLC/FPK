import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthRoles } from '../auth/auth.guards';
import { User, UserRole, UserStatus } from '../users/user.entity';
import { Payment, PaymentMethod, PaymentStatus } from '../payments/payment.entity';
import { Location } from '../locations/location.entity';
import { PromoCode } from '../payments/promo-code.entity';
import { DrinkLog } from '../drinks/drink-log.entity';
import { DrinkRequest, DrinkRequestStatus } from '../drink-requests/drink-request.entity';

/**
 * Admin stats — pre-aggregated counters for the Admin Home dashboard.
 * Light-weight COUNT/SUM queries so the dashboard renders fast.
 */
@Controller('admin')
export class AdminController {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Payment) private paymentRepo: Repository<Payment>,
    @InjectRepository(Location) private locationRepo: Repository<Location>,
    @InjectRepository(PromoCode) private promoRepo: Repository<PromoCode>,
    @InjectRepository(DrinkLog) private drinkLogRepo: Repository<DrinkLog>,
    @InjectRepository(DrinkRequest) private drinkRequestRepo: Repository<DrinkRequest>,
  ) {}

  @Get('stats')
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER, UserRole.STAFF)
  async getStats() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      membersTotal,
      membersPending,
      staffTotal,
      locationsTotal,
      promosActive,
      pendingCashCount,
      cashTodayRow,
      drinksTodayCount,
      pendingDrinkRequests,
    ] = await Promise.all([
      this.userRepo.count({ where: { role: UserRole.MEMBER } }),
      this.userRepo.count({ where: { role: UserRole.MEMBER, status: UserStatus.PENDING } }),
      this.userRepo
        .createQueryBuilder('u')
        .where('u.role IN (:...roles)', { roles: [UserRole.STAFF, UserRole.MANAGER, UserRole.OWNER] })
        .getCount(),
      this.locationRepo.count({ where: { isActive: true } }),
      this.promoRepo.count({ where: { isActive: true } }),
      this.paymentRepo.count({
        where: { method: PaymentMethod.CASH, status: PaymentStatus.PENDING },
      }),
      this.paymentRepo
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount), 0)', 'sum')
        .where('p.method = :method', { method: PaymentMethod.CASH })
        .andWhere('p.status = :status', { status: PaymentStatus.COMPLETED })
        .andWhere('p.created_at >= :start', { start: startOfToday })
        .getRawOne(),
      this.drinkLogRepo
        .createQueryBuilder('l')
        .where('l.scanned_at >= :start', { start: startOfToday })
        .getCount(),
      this.drinkRequestRepo.count({
        where: { status: DrinkRequestStatus.PENDING },
      }),
    ]);

    return {
      membersTotal,
      membersPending,
      staffTotal,
      locationsTotal,
      promosActive,
      pendingCashCount,
      cashTodayCents: parseInt(cashTodayRow?.sum || '0', 10),
      drinksTodayCount,
      pendingDrinkRequests,
    };
  }
}
