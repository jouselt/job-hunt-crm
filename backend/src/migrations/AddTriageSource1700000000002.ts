import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTriageSource1700000000002 implements MigrationInterface {
  name = 'AddTriageSource1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_source_check`,
    );
    await queryRunner.query(
      `ALTER TABLE applications ADD CONSTRAINT applications_source_check CHECK (source IN ('linkedin','indeed','referral','other','triage'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_source_check`,
    );
    await queryRunner.query(
      `ALTER TABLE applications ADD CONSTRAINT applications_source_check CHECK (source IN ('linkedin','indeed','referral','other'))`,
    );
  }
}
