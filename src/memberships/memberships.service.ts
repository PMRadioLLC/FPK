import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Membership,
  MembershipPlan,
  MembershipStatus,
  MEMBERSHIP_PRICES,
  MEMBERSHIP_DURATIONS,
} from './membership.entity';
import { User, UserStatus } from '../users/user.entity';
import { PromoCode, DiscountType } from '../payments/promo-code.entity';

@Injectable()
export class MembershipsService {
  private readonly logger = new Logger(MembershipsService.name);

  constructor(
    @InjectRepository(Membership) private membershipRepo: Repository<Membership>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(PromoCode) private promoRepo: Repository<PromoCode>,
  ) {}

  /**
   * Get the current active membership for a user
   */
  async getActiveMembership(userId: string): Promise<Membership | null> {
    return this.membershipRepo.findOne({
      where: { userId, status: MembershipStatus.ACTIVE },
    });
  }

  /**
   * Get all memberships for a user (history)
   */
  async getMembershipHistory(userId: string): Promise<Membership[]> {
    return this.membershipRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Create a new membership (after payment is confirmed).
   * Called by the PaymentService after Stripe/cash payment succeeds.
   */
  async createMembership(
    userId: string,
    plan: MembershipPlan,
    promoCode?: string,
    stripeSubscriptionId?: string,
  ): Promise<Membership> {
    // Check user is verified
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.status !== UserStatus.VERIFIED) {
      throw new ForbiddenException(
        'Your account must be verified before purchasing a membership. ' +
        'Please visit a Fun Pizza Kitchen location with your ID.',
      );
    }

    // Check for existing active membership
    const existing = await this.getActiveMembership(userId);
    if (existing) {
      throw new BadRequestException('You already have an active membership.');
    }

    // Calculate price (apply promo if provided)
    let price = MEMBERSHIP_PRICES[plan];
    let promoCodeId: string | null = null;

    if (promoCode) {
      const promo = await this.validatePromoCode(promoCode);
      promoCodeId = promo.id;

      if (promo.discountType === DiscountType.PERCENTAGE) {
        price = Math.round(price * (1 - promo.discountValue / 100));
      } else {
        price = Math.max(0, price - promo.discountValue);
      }

      // Increment promo usage
      promo.currentUses += 1;
      await this.promoRepo.save(promo);
    }

    // Calculate dates
    const startsAt = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + MEMBERSHIP_DURATIONS[plan]);

    const membership = this.membershipRepo.create({
      userId,
      plan,
      status: MembershipStatus.ACTIVE,
      pricePaid: price,
      startsAt,
      expiresAt,
      autoRenew: true,
      stripeSubscriptionId: stripeSubscriptionId || null,
      promoCodeId,
    });

    await this.membershipRepo.save(membership);
    this.logger.log(`Membership created: user=${userId} plan=${plan} price=${price}`);

    return membership;
  }

  /**
   * Cancel auto-renewal (user keeps membership until expiry)
   */
  async cancelAutoRenew(userId: string): Promise<Membership> {
    const membership = await this.getActiveMembership(userId);
    if (!membership) throw new NotFoundException('No active membership');

    membership.autoRenew = false;
    await this.membershipRepo.save(membership);

    this.logger.log(`Auto-renew cancelled: user=${userId}`);
    return membership;
  }

  /**
   * Revoke a membership immediately (admin action)
   */
  async revokeMembership(membershipId: string): Promise<Membership> {
    const membership = await this.membershipRepo.findOne({
      where: { id: membershipId },
    });
    if (!membership) throw new NotFoundException('Membership not found');

    membership.status = MembershipStatus.CANCELLED;
    await this.membershipRepo.save(membership);

    this.logger.log(`Membership revoked: ${membershipId}`);
    return membership;
  }

  /**
   * Validate a promo code
   */
  async validatePromoCode(code: string): Promise<PromoCode> {
    const promo = await this.promoRepo.findOne({
      where: { code: code.toUpperCase(), isActive: true },
    });

    if (!promo) {
      throw new BadRequestException('Invalid promo code');
    }

    if (promo.expiresAt && new Date() > promo.expiresAt) {
      throw new BadRequestException('Promo code has expired');
    }

    if (promo.maxUses > 0 && promo.currentUses >= promo.maxUses) {
      throw new BadRequestException('Promo code usage limit reached');
    }

    return promo;
  }

  /**
   * Get available plans with prices
   */
  getAvailablePlans() {
    return [
      {
        plan: MembershipPlan.MONTHLY,
        label: 'Monthly',
        price: MEMBERSHIP_PRICES[MembershipPlan.MONTHLY],
        priceFormatted: '$79.99/month',
        duration: '30 days',
      },
      {
        plan: MembershipPlan.SIX_MONTH,
        label: '6 Months',
        price: MEMBERSHIP_PRICES[MembershipPlan.SIX_MONTH],
        priceFormatted: '$449.99',
        duration: '180 days',
        savings: '$29.95',
      },
      {
        plan: MembershipPlan.ANNUAL,
        label: 'Annual',
        price: MEMBERSHIP_PRICES[MembershipPlan.ANNUAL],
        priceFormatted: '$799.99/year',
        duration: '365 days',
        savings: '$159.89',
      },
    ];
  }
}
