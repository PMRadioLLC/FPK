import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1712150400000 implements MigrationInterface {
  name = 'InitialSchema1712150400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable uuid extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ========== USERS ==========
    await queryRunner.query(`
      CREATE TYPE "user_role_enum" AS ENUM ('member', 'staff', 'manager', 'owner')
    `);
    await queryRunner.query(`
      CREATE TYPE "user_status_enum" AS ENUM ('pending', 'verified', 'banned')
    `);
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" varchar NOT NULL,
        "full_name" varchar NOT NULL,
        "date_of_birth" date NOT NULL,
        "selfie_url" varchar,
        "phone" varchar,
        "firebase_uid" varchar NOT NULL,
        "role" "user_role_enum" NOT NULL DEFAULT 'member',
        "status" "user_status_enum" NOT NULL DEFAULT 'pending',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "UQ_users_firebase_uid" UNIQUE ("firebase_uid"),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);

    // ========== LOCATIONS ==========
    await queryRunner.query(`
      CREATE TABLE "locations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar NOT NULL,
        "address" varchar NOT NULL,
        "city" varchar NOT NULL,
        "state" varchar NOT NULL,
        "zip" varchar NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_locations" PRIMARY KEY ("id")
      )
    `);

    // ========== PROMO CODES ==========
    await queryRunner.query(`
      CREATE TYPE "discount_type_enum" AS ENUM ('percentage', 'fixed_amount')
    `);
    await queryRunner.query(`
      CREATE TABLE "promo_codes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" varchar NOT NULL,
        "discount_type" "discount_type_enum" NOT NULL,
        "discount_value" integer NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE,
        "max_uses" integer NOT NULL DEFAULT 0,
        "current_uses" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_promo_codes_code" UNIQUE ("code"),
        CONSTRAINT "PK_promo_codes" PRIMARY KEY ("id")
      )
    `);

    // ========== MEMBERSHIPS ==========
    await queryRunner.query(`
      CREATE TYPE "membership_plan_enum" AS ENUM ('monthly', 'six_month', 'annual')
    `);
    await queryRunner.query(`
      CREATE TYPE "membership_status_enum" AS ENUM ('pending', 'active', 'cancelled', 'expired')
    `);
    await queryRunner.query(`
      CREATE TABLE "memberships" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "plan" "membership_plan_enum" NOT NULL,
        "status" "membership_status_enum" NOT NULL DEFAULT 'pending',
        "price_paid" integer NOT NULL,
        "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "auto_renew" boolean NOT NULL DEFAULT true,
        "stripe_subscription_id" varchar,
        "promo_code_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_memberships" PRIMARY KEY ("id"),
        CONSTRAINT "FK_memberships_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_memberships_promo" FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes"("id") ON DELETE SET NULL
      )
    `);

    // ========== ID VERIFICATIONS ==========
    await queryRunner.query(`
      CREATE TYPE "verification_status_enum" AS ENUM ('pending', 'approved', 'rejected')
    `);
    await queryRunner.query(`
      CREATE TYPE "id_type_enum" AS ENUM ('drivers_license', 'passport', 'state_id')
    `);
    await queryRunner.query(`
      CREATE TABLE "id_verifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "verified_by_staff_id" uuid,
        "id_photo_url" varchar,
        "id_type" "id_type_enum",
        "id_date_of_birth" date,
        "rejection_reason" varchar,
        "status" "verification_status_enum" NOT NULL DEFAULT 'pending',
        "verified_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_id_verifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_id_verifications_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_id_verifications_staff" FOREIGN KEY ("verified_by_staff_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    // ========== BARCODE SECRETS ==========
    await queryRunner.query(`
      CREATE TABLE "barcode_secrets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "secret_key" varchar NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "rotated_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "UQ_barcode_secrets_user" UNIQUE ("user_id"),
        CONSTRAINT "PK_barcode_secrets" PRIMARY KEY ("id"),
        CONSTRAINT "FK_barcode_secrets_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // ========== DRINK MENU ITEMS ==========
    await queryRunner.query(`
      CREATE TYPE "drink_category_enum" AS ENUM ('draft_beer', 'american_beer')
    `);
    await queryRunner.query(`
      CREATE TABLE "drink_menu_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar NOT NULL,
        "category" "drink_category_enum" NOT NULL,
        "description" varchar,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_drink_menu_items" PRIMARY KEY ("id")
      )
    `);

    // ========== LOCATION DRINKS ==========
    await queryRunner.query(`
      CREATE TABLE "location_drinks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "location_id" uuid NOT NULL,
        "drink_item_id" uuid NOT NULL,
        "is_available" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_location_drinks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_location_drinks_location" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_location_drinks_drink" FOREIGN KEY ("drink_item_id") REFERENCES "drink_menu_items"("id") ON DELETE CASCADE
      )
    `);

    // ========== DRINK LOGS ==========
    await queryRunner.query(`
      CREATE TABLE "drink_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "location_id" uuid NOT NULL,
        "staff_id" uuid NOT NULL,
        "barcode_token_hash" varchar,
        "scanned_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_drink_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_drink_logs_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_drink_logs_location" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_drink_logs_staff" FOREIGN KEY ("staff_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // ========== DRINK LIMIT CONFIGS ==========
    await queryRunner.query(`
      CREATE TABLE "drink_limit_configs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "location_id" uuid NOT NULL,
        "max_drinks_per_day" integer NOT NULL DEFAULT 0,
        "cooldown_minutes" integer NOT NULL DEFAULT 0,
        "is_unlimited" boolean NOT NULL DEFAULT true,
        "is_active" boolean NOT NULL DEFAULT true,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_drink_limit_configs_location" UNIQUE ("location_id"),
        CONSTRAINT "PK_drink_limit_configs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_drink_limit_configs_location" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE
      )
    `);

    // ========== PAYMENTS ==========
    await queryRunner.query(`
      CREATE TYPE "payment_method_enum" AS ENUM ('card', 'cash')
    `);
    await queryRunner.query(`
      CREATE TYPE "payment_status_enum" AS ENUM ('pending', 'completed', 'failed', 'refunded')
    `);
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "membership_id" uuid NOT NULL,
        "amount" integer NOT NULL,
        "method" "payment_method_enum" NOT NULL,
        "status" "payment_status_enum" NOT NULL DEFAULT 'pending',
        "stripe_payment_id" varchar,
        "confirmed_by_staff_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payments_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_payments_membership" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_payments_staff" FOREIGN KEY ("confirmed_by_staff_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    // ========== STAFF ASSIGNMENTS ==========
    await queryRunner.query(`
      CREATE TYPE "staff_role_enum" AS ENUM ('staff', 'manager')
    `);
    await queryRunner.query(`
      CREATE TABLE "staff_assignments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "location_id" uuid NOT NULL,
        "role" "staff_role_enum" NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "assigned_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_staff_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_staff_assignments_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_staff_assignments_location" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE
      )
    `);

    // ========== INDEXES FOR PERFORMANCE ==========
    await queryRunner.query(`CREATE INDEX "IDX_memberships_user_id" ON "memberships" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_memberships_status" ON "memberships" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_drink_logs_user_id" ON "drink_logs" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_drink_logs_scanned_at" ON "drink_logs" ("scanned_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_drink_logs_location_id" ON "drink_logs" ("location_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_payments_user_id" ON "payments" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_payments_status" ON "payments" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_id_verifications_user_id" ON "id_verifications" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_id_verifications_status" ON "id_verifications" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_staff_assignments_user_location" ON "staff_assignments" ("user_id", "location_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "staff_assignments" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payments" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "drink_limit_configs" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "drink_logs" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "location_drinks" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "drink_menu_items" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "barcode_secrets" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "id_verifications" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "memberships" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "promo_codes" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "locations" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users" CASCADE`);
    await queryRunner.query(`DROP TYPE IF EXISTS "staff_role_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "payment_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "payment_method_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "drink_category_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "verification_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "id_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "membership_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "membership_plan_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "discount_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_role_enum"`);
  }
}
