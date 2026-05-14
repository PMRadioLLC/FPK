import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Location } from '../locations/location.entity';

@Entity('drink_limit_configs')
export class DrinkLimitConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'location_id', unique: true })
  locationId: string;

  @ManyToOne(() => Location)
  @JoinColumn({ name: 'location_id' })
  location: Location;

  @Column({ name: 'max_drinks_per_day', default: 0 })
  maxDrinksPerDay: number; // 0 = unlimited

  @Column({ name: 'cooldown_minutes', default: 0 })
  cooldownMinutes: number; // 0 = no cooldown

  @Column({ name: 'is_unlimited', default: true })
  isUnlimited: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
