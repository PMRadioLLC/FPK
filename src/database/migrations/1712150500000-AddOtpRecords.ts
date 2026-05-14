import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOtpRecords1712150500000 implements MigrationInterface {
  name = 'AddOtpRecords1712150500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "otp_records" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" varchar NOT NULL,
        "code" varchar(6) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "wrong_attempts" integer NOT NULL DEFAULT 0,
        "used" boolean NOT NULL DEFAULT false,
        "blocked" boolean NOT NULL DEFAULT false,
        "blocked_until" TIMESTAMP WITH TIME ZONE,
        "verified_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_otp_records" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_otp_records_email" ON "otp_records" ("email")`);
    await queryRunner.query(`CREATE INDEX "IDX_otp_records_email_used" ON "otp_records" ("email", "used")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "otp_records" CASCADE`);
  }
}
