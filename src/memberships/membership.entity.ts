import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum MembershipPlan {
  MONTHLY = 'monthly',
  SIX_MONTH = 'six_month',
  ANNUAL = 'annual',
}

export enum MembershipStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

// Prices in cents to avoid floating point issues
export const MEMBERSHIP_PRICES = {
  [MembershipPlan.MONTHLY]: 7999,       // $79.99
  [MembershipPlan.SIX_MONTH]: 44999,    // $449.99
  [MembershipPlan.ANNUAL]: 79999,       // $799.99
};

// Duration in days
export const MEMBERSHIP_DURATIONS = {
  [MembershipPlan.MONTHLY]: 30,
  [MembershipPlan.SIX_MONTH]: 180,
  [MembershipPlan.ANNUAL]: 365,
};

@Entity('memberships')
export class Membership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: MembershipPlan })
  plan: MembershipPlan;

  @Column({ type: 'enum', enum: MembershipStatus, default: MembershipStatus.PENDING })
  status: MembershipStatus;

  @Column({ name: 'price_paid', type: 'integer' })
  pricePaid: number; // stored in cents

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'auto_renew', default: true })
  autoRenew: boolean;

  @Column({ name: 'stripe_subscription_id', type: 'varchar', nullable: true })
  stripeSubscriptionId: string | null;

  @Column({ name: 'promo_code_id', type: 'uuid', nullable: true })
  promoCodeId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
