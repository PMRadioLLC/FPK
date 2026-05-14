import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum VerificationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum IdType {
  DRIVERS_LICENSE = 'drivers_license',
  PASSPORT = 'passport',
  STATE_ID = 'state_id',
}

@Entity('id_verifications')
export class IdVerification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'verified_by_staff_id', nullable: true })
  verifiedByStaffId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'verified_by_staff_id' })
  verifiedByStaff: User;

  @Column({ name: 'id_photo_url', nullable: true })
  idPhotoUrl: string;

  @Column({ name: 'id_type', type: 'enum', enum: IdType, nullable: true })
  idType: IdType;

  @Column({ name: 'id_date_of_birth', type: 'date', nullable: true })
  idDateOfBirth: Date;

  @Column({ type: 'enum', enum: VerificationStatus, default: VerificationStatus.PENDING })
  status: VerificationStatus;

  @Column({ name: 'rejection_reason', nullable: true })
  rejectionReason: string;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
