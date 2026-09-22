import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1699999999999 implements MigrationInterface {
  name = 'Init1699999999999';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS applications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        company TEXT NOT NULL,
        role TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('linkedin','indeed','referral','other')),
        stage TEXT NOT NULL CHECK (stage IN ('applied','screened','interview','offer','rejected')) DEFAULT 'applied',
        applied_date DATE NOT NULL DEFAULT CURRENT_DATE,
        follow_up_date DATE,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_applications_user_stage ON applications (user_id, stage)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_applications_user_followup ON applications (user_id, follow_up_date)
    `);

    await queryRunner.query(`
      ALTER TABLE applications ENABLE ROW LEVEL SECURITY
    `);

    await queryRunner.query(`
      CREATE POLICY applications_user_isolation ON applications
        USING (user_id = current_setting('app.current_user_id')::uuid)
        WITH CHECK (user_id = current_setting('app.current_user_id')::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY IF EXISTS applications_user_isolation ON applications`);
    await queryRunner.query(`ALTER TABLE applications DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_applications_user_followup`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_applications_user_stage`);
    await queryRunner.query(`DROP TABLE IF EXISTS applications`);
  }
}
