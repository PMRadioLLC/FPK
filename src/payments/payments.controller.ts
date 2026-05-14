import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Req,
  Headers,
  RawBodyRequest,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import { Auth, AuthRoles, CurrentUser } from '../auth/auth.guards';
import { User, UserRole } from '../users/user.entity';
import { MembershipPlan } from '../memberships/membership.entity';

@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  /**
   * POST /payments/card — Create a Stripe PaymentIntent
   * Returns clientSecret for the mobile app to complete payment
   */
  @Post('card')
  @Auth()
  createCardPayment(
    @CurrentUser() user: User,
    @Body() body: { plan: MembershipPlan; promoCode?: string },
  ) {
    return this.paymentsService.createCardPayment(
      user.id,
      body.plan,
      body.promoCode,
    );
  }

  /**
   * POST /payments/cash — Request a cash payment (pending staff confirmation)
   */
  @Post('cash')
  @Auth()
  createCashPayment(
    @CurrentUser() user: User,
    @Body() body: { plan: MembershipPlan; promoCode?: string },
  ) {
    return this.paymentsService.createCashPayment(
      user.id,
      body.plan,
      body.promoCode,
    );
  }

  /**
   * GET /payments/cash/pending — Staff: view pending cash payments
   */
  @Get('cash/pending')
  @AuthRoles(UserRole.STAFF, UserRole.MANAGER, UserRole.OWNER)
  getPendingCashPayments() {
    return this.paymentsService.getPendingCashPayments();
  }

  /**
   * PUT /payments/cash/:id/confirm — Staff confirms cash was received
   */
  @Put('cash/:id/confirm')
  @AuthRoles(UserRole.STAFF, UserRole.MANAGER, UserRole.OWNER)
  confirmCashPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() staff: User,
    @Body() body: { plan: MembershipPlan; promoCode?: string },
  ) {
    return this.paymentsService.confirmCashPayment(
      id,
      staff.id,
      body.plan,
      body.promoCode,
    );
  }

  /**
   * POST /payments/webhook — Stripe webhook (no auth — verified by signature)
   * IMPORTANT: This endpoint needs raw body access for signature verification.
   */
  @Post('webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new Error('Raw body not available — check NestJS raw body config');
    }
    await this.paymentsService.handleStripeWebhook(rawBody, signature);
    return { received: true };
  }

  // ==================== PROMO CODES ====================

  /** GET /payments/promo-codes — Admin: list all promo codes */
  @Get('promo-codes')
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER)
  getPromoCodes() {
    return this.paymentsService.getAllPromoCodes();
  }

  /** POST /payments/promo-codes — Admin: create a new promo code */
  @Post('promo-codes')
  @AuthRoles(UserRole.OWNER, UserRole.MANAGER)
  createPromoCode(
    @Body() body: {
      code: string;
      discountType: 'percentage' | 'fixed_amount';
      discountValue: number;
      expiresAt?: string;
      maxUses?: number;
    },
  ) {
    return this.paymentsService.createPromoCode(body);
  }
}
