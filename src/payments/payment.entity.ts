import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Membership } from '../memberships/membership.entity';

export enum PaymentMethod {
  CARD = 'card',
  CASH = 'cash',
}

export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'membership_id', nullable: true })
  membershipId: string | null;

  @ManyToOne(() => Membership, { nullable: true })
  @JoinColumn({ name: 'membership_id' })
  membership: Membership | null;

  @Column({ type: 'integer' })
  amount: number; // in cents

  @Column({ type: 'enum', enum: PaymentMethod })
  method: PaymentMethod;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ name: 'stripe_payment_id', nullable: true })
  stripePaymentId: string;

  @Column({ name: 'confirmed_by_staff_id', nullable: true })
  confirmedByStaffId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'confirmed_by_staff_id' })
  confirmedByStaff: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
