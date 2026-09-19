import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOffer1700000000001 implements MigrationInterface {
  name = 'AddOffer1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS offers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "externalId" TEXT NOT NULL,
        "userId" UUID NOT NULL,
        title TEXT NOT NULL,
        company TEXT NOT NULL,
        "companyUrl" TEXT,
        location TEXT,
        url TEXT,
        description TEXT,
        deadline DATE,
        "applyUrl" TEXT,
        status TEXT NOT NULL DEFAULT 'NEW',
        fit TEXT,
        "jevRaw" JSONB,
        "jevConfidence" DOUBLE PRECISION,
        "decisionAt" DATE,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_offers_user_external ON offers ("userId", "externalId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_offers_user_status ON offers ("userId", status)`,
    );

    await queryRunner.query(`ALTER TABLE offers ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY offers_user_isolation ON offers
        USING ("userId" = current_setting('app.current_user_id')::uuid)
        WITH CHECK ("userId" = current_setting('app.current_user_id')::uuid)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY IF EXISTS offers_user_isolation ON offers`);
    await queryRunner.query(`ALTER TABLE offers DISABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_offers_user_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_offers_user_external`);
    await queryRunner.query(`DROP TABLE IF EXISTS offers`);
  }
}
