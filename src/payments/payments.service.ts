import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Payment, PaymentMethod, PaymentStatus } from './payment.entity';
import { PromoCode } from './promo-code.entity';
import { MembershipsService } from '../memberships/memberships.service';
import { MembershipPlan, MEMBERSHIP_PRICES } from '../memberships/membership.entity';
import { User, UserStatus } from '../users/user.entity';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private stripe: Stripe;

  constructor(
    @InjectRepository(Payment) private paymentRepo: Repository<Payment>,
    @InjectRepository(PromoCode) private promoRepo: Repository<PromoCode>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private membershipsService: MembershipsService,
    private configService: ConfigService,
  ) {
    this.stripe = new Stripe(
      this.configService.get<string>('STRIPE_SECRET_KEY', ''),
      { apiVersion: '2024-04-10' as any },
    );
  }

  // ==========================================
  // CARD PAYMENT — Create Stripe PaymentIntent
  // ==========================================
  async createCardPayment(
    userId: string,
    plan: MembershipPlan,
    promoCode?: string,
  ): Promise<{ clientSecret: string; paymentId: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.status === UserStatus.BANNED) {
      throw new BadRequestException('Account is banned');
    }

    // Calculate price with promo
    let amount = MEMBERSHIP_PRICES[plan];
    let promoCodeId: string | null = null;

    if (promoCode) {
      const promo = await this.membershipsService.validatePromoCode(promoCode);
      promoCodeId = promo.id;
      if (promo.discountType === 'percentage') {
        amount = Math.round(amount * (1 - promo.discountValue / 100));
      } else {
        amount = Math.max(0, amount - promo.discountValue);
      }
    }

    // Create Stripe PaymentIntent
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      metadata: {
        userId,
        plan,
        promoCodeId: promoCodeId || '',
      },
      receipt_email: user.email,
    });

    // Create our payment record (pending) — membershipId set to null until webhook confirms payment
    const payment = this.paymentRepo.create({
      userId,
      membershipId: null,
      amount,
      method: PaymentMethod.CARD,
      status: PaymentStatus.PENDING,
      stripePaymentId: paymentIntent.id,
    });
    await this.paymentRepo.save(payment);

    this.logger.log(`PaymentIntent created: ${paymentIntent.id} for user ${userId}`);

    return {
      clientSecret: paymentIntent.client_secret!,
      paymentId: payment.id,
    };
  }

  // ==========================================
  // STRIPE WEBHOOK — Handle payment confirmation
  // ==========================================
  async handleStripeWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET', '');

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      this.logger.error(`Webhook signature verification failed: ${err.message}`);
      throw new BadRequestException('Invalid webhook signature');
    }

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      await this.confirmCardPayment(paymentIntent);
    }

    if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      await this.failPayment(paymentIntent.id);
    }
  }

  // ==========================================
  // CASH PAYMENT — User selects cash, pays at counter
  // ==========================================
  async createCashPayment(
    userId: string,
    plan: MembershipPlan,
    promoCode?: string,
  ): Promise<Payment> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.status === UserStatus.BANNED) {
      throw new BadRequestException('Account is banned');
    }

    let amount = MEMBERSHIP_PRICES[plan];
    if (promoCode) {
      const promo = await this.membershipsService.validatePromoCode(promoCode);
      if (promo.discountType === 'percentage') {
        amount = Math.round(amount * (1 - promo.discountValue / 100));
      } else {
        amount = Math.max(0, amount - promo.discountValue);
      }
    }

    const payment = this.paymentRepo.create({
      userId,
      membershipId: null,
      amount,
      method: PaymentMethod.CASH,
      status: PaymentStatus.PENDING,
    });
    await this.paymentRepo.save(payment);

    this.logger.log(`Cash payment pending: ${payment.id} for user ${userId} ($${(amount / 100).toFixed(2)})`);
    return payment;
  }

  /**
   * Staff confirms cash was received at counter
   */
  async confirmCashPayment(
    paymentId: string,
    staffId: string,
    plan: MembershipPlan,
    promoCode?: string,
  ): Promise<Payment> {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId, method: PaymentMethod.CASH, status: PaymentStatus.PENDING },
    });
    if (!payment) throw new NotFoundException('Pending cash payment not found');

    // Create the membership
    const membership = await this.membershipsService.createMembership(
      payment.userId,
      plan,
      promoCode,
    );

    // Update payment
    payment.status = PaymentStatus.COMPLETED;
    payment.confirmedByStaffId = staffId;
    payment.membershipId = membership.id;
    await this.paymentRepo.save(payment);

    this.logger.log(`Cash payment confirmed: ${paymentId} by staff ${staffId}`);
    return payment;
  }

  // ==========================================
  // ADMIN: Get pending cash payments
  // ==========================================
  async getPendingCashPayments(): Promise<Payment[]> {
    return this.paymentRepo.find({
      where: { method: PaymentMethod.CASH, status: PaymentStatus.PENDING },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  // ==========================================
  // PROMO CODE MANAGEMENT (Admin)
  // ==========================================
  async createPromoCode(data: {
    code: string;
    discountType: 'percentage' | 'fixed_amount';
    discountValue: number;
    expiresAt?: string;
    maxUses?: number;
  }): Promise<PromoCode> {
    const existing = await this.promoRepo.findOne({
      where: { code: data.code.toUpperCase() },
    });
    if (existing) throw new BadRequestException('Promo code already exists');

    const promo = this.promoRepo.create({
      code: data.code.toUpperCase(),
      discountType: data.discountType as any,
      discountValue: data.discountValue,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      maxUses: data.maxUses || 0,
    });
    return this.promoRepo.save(promo);
  }

  async getAllPromoCodes(): Promise<PromoCode[]> {
    return this.promoRepo.find({ order: { createdAt: 'DESC' } });
  }

  /**
   * Sync a payment's status from Stripe. Used as a backup when the webhook
   * fails to fire (network blip, misconfigured endpoint, etc).
   *
   * - Fetches the PaymentIntent from Stripe.
   * - If 'succeeded' and we haven't already → creates membership, marks complete.
   * - If 'requires_payment_method' / 'canceled' → marks payment as failed.
   * - Idempotent: calling repeatedly after success is safe.
   *
   * Returns the (possibly updated) payment row plus an `activated` flag so the
   * client knows whether to refresh.
   */
  async syncPaymentFromStripe(
    paymentId: string,
    userId: string,
  ): Promise<{ payment: Payment; activated: boolean }> {
    const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.userId !== userId) {
      throw new BadRequestException('Not your payment');
    }
    if (payment.method !== PaymentMethod.CARD || !payment.stripePaymentId) {
      // Cash payments are reconciled by staff, not Stripe.
      return { payment, activated: false };
    }

    // Already settled — nothing to do.
    if (payment.status === PaymentStatus.COMPLETED) {
      return { payment, activated: false };
    }

    const intent = await this.stripe.paymentIntents.retrieve(payment.stripePaymentId);

    if (intent.status === 'succeeded') {
      await this.confirmCardPayment(intent);
      const refreshed = await this.paymentRepo.findOne({ where: { id: payment.id } });
      return { payment: refreshed!, activated: true };
    }

    if (intent.status === 'canceled' || intent.status === 'requires_payment_method') {
      payment.status = PaymentStatus.FAILED;
      await this.paymentRepo.save(payment);
      return { payment, activated: false };
    }

    // Still processing — leave pending, frontend will poll again.
    return { payment, activated: false };
  }

  // ==========================================
  // HELPERS
  // ==========================================
  private async confirmCardPayment(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const { userId, plan, promoCodeId } = paymentIntent.metadata;

    const payment = await this.paymentRepo.findOne({
      where: { stripePaymentId: paymentIntent.id },
    });
    if (!payment) {
      this.logger.error(`Payment record not found for Stripe PI: ${paymentIntent.id}`);
      return;
    }

    // Idempotency guard — if this PI was already confirmed (webhook fired before
    // sync, or vice versa) skip the duplicate membership creation.
    if (payment.status === PaymentStatus.COMPLETED && payment.membershipId) {
      this.logger.log(`Card payment already settled: ${paymentIntent.id}`);
      return;
    }

    const membership = await this.membershipsService.createMembership(
      userId,
      plan as MembershipPlan,
      undefined, // promo already applied to price
      paymentIntent.id,
    );

    payment.status = PaymentStatus.COMPLETED;
    payment.membershipId = membership.id;
    await this.paymentRepo.save(payment);

    this.logger.log(`Card payment confirmed: ${paymentIntent.id} → membership ${membership.id}`);
  }

  async getMyPayments(userId: string): Promise<{
    thisMonth: number;
    thisYear: number;
    payments: { id: string; amount: number; method: string; status: string; createdAt: Date }[];
  }> {
    const all = await this.paymentRepo.find({
      where: { userId, status: PaymentStatus.COMPLETED },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    const now = new Date();
    const thisMonth = all
      .filter(p => {
        const d = new Date(p.createdAt);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .reduce((s, p) => s + p.amount, 0);

    const thisYear = all
      .filter(p => new Date(p.createdAt).getFullYear() === now.getFullYear())
      .reduce((s, p) => s + p.amount, 0);

    return {
      thisMonth,
      thisYear,
      payments: all.map(p => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        status: p.status,
        createdAt: p.createdAt,
      })),
    };
  }

  private async failPayment(stripePaymentId: string): Promise<void> {
    const payment = await this.paymentRepo.findOne({
      where: { stripePaymentId },
    });
    if (payment) {
      payment.status = PaymentStatus.FAILED;
      await this.paymentRepo.save(payment);
      this.logger.warn(`Payment failed: ${stripePaymentId}`);
    }
  }
}
