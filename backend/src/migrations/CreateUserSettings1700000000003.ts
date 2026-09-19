import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserSettings1700000000003 implements MigrationInterface {
  name = 'CreateUserSettings1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        "userId" UUID PRIMARY KEY,
        "jevApiKeyEnc" TEXT,
        "triageProfile" JSONB,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS user_settings`);
  }
}
