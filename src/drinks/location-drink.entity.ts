import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Location } from '../locations/location.entity';
import { DrinkMenuItem } from './drink-menu-item.entity';

@Entity('location_drinks')
export class LocationDrink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

  @Column({ name: 'is_available', default: true })
  isAvailable: boolean;
}
