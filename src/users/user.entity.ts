import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';

export enum UserRole {
  MEMBER = 'member',
  STAFF = 'staff',
  MANAGER = 'manager',
  OWNER = 'owner',
}

export enum UserStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  BANNED = 'banned',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'full_name' })
  fullName: string;

  @Column({ name: 'date_of_birth', type: 'date' })
  dateOfBirth: Date;

  @Column({ name: 'selfie_url', type: 'varchar', nullable: true })
  selfieUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ name: 'firebase_uid', unique: true })
  firebaseUid: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.MEMBER })
  role: UserRole;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.PENDING })
  status: UserStatus;

  // ID verification audit fields
  @Column({ name: 'verified_by_id', type: 'uuid', nullable: true })
  verifiedById: string | null;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @Column({ name: 'id_photo_url', type: 'varchar', nullable: true })
  idPhotoUrl: string | null;

  /**
   * Bumped to invalidate all outstanding JWTs for this user. Every issued
   * JWT carries the value of token_version at issue time; the JwtStrategy
   * compares it against the current value and rejects if mismatched.
   * Bumped on: ban, role change, password change, logout-from-all.
   */
  @Column({ name: 'token_version', type: 'int', default: 0 })
  tokenVersion: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
