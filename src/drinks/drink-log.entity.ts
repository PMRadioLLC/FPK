import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Location } from '../locations/location.entity';

@Entity('drink_logs')
export class DrinkLog {
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

  @Column({ name: 'staff_id' })
  staffId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'staff_id' })
  staff: User;

  @Column({ name: 'barcode_token_hash', nullable: true })
  barcodeTokenHash: string;

  @CreateDateColumn({ name: 'scanned_at' })
  scannedAt: Date;
}
