import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Split the overloaded `fit` column into the two facts it was conflating:
 * the numeric Jev fit score and the deterministic gate decision.
 *
 * `offers` is introduced by the offer-triage feature itself, so there is no
 * production data to migrate; everything stays nullable anyway so the change
 * is safe to run against a partially-populated table.
 */
export class AddOfferFitScore1700000000004 implements MigrationInterface {
  name = 'AddOfferFitScore1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE offers ADD COLUMN IF NOT EXISTS "fitScore" DOUBLE PRECISION`,
    );
    await queryRunner.query(`ALTER TABLE offers ADD COLUMN IF NOT EXISTS decision TEXT`);
    await queryRunner.query(`ALTER TABLE offers DROP COLUMN IF EXISTS fit`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE offers ADD COLUMN IF NOT EXISTS fit TEXT`);
    await queryRunner.query(`ALTER TABLE offers DROP COLUMN IF EXISTS decision`);
    await queryRunner.query(`ALTER TABLE offers DROP COLUMN IF EXISTS "fitScore"`);
  }
}
