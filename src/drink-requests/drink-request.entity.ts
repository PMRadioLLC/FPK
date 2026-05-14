import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { Location } from '../locations/location.entity';
import { DrinkMenuItem } from '../drinks/drink-menu-item.entity';

export enum DrinkRequestStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  FULFILLED = 'fulfilled', // drink physically delivered (rolling barcode scanned)
  CANCELLED = 'cancelled',
}

@Entity('drink_requests')
export class DrinkRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'location_id' })
  locationId: string;

  @ManyToOne(() => Location)
  @JoinColumn({ name: 'location_id' })
  location: Location;

  @Column({ name: 'drink_item_id' })
  drinkItemId: string;

  @ManyToOne(() => DrinkMenuItem)
  @JoinColumn({ name: 'drink_item_id' })
  drinkItem: DrinkMenuItem;

  @Column({ name: 'table_number', type: 'integer' })
  tableNumber: number;

  @Column({ type: 'varchar', length: 20, default: DrinkRequestStatus.PENDING })
  status: DrinkRequestStatus;

  @Column({ name: 'accepted_by_id', nullable: true })
  acceptedById: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'accepted_by_id' })
  acceptedBy: User;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ name: 'fulfilled_at', type: 'timestamptz', nullable: true })
  fulfilledAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
