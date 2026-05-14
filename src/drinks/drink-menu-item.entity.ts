import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum DrinkCategory {
  DRAFT_BEER = 'draft_beer',
  AMERICAN_BEER = 'american_beer',
}

@Entity('drink_menu_items')
export class DrinkMenuItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: DrinkCategory })
  category: DrinkCategory;

  @Column({ nullable: true })
  description: string;

  @Column({ name: 'photo_url', type: 'varchar', nullable: true })
  photoUrl: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
