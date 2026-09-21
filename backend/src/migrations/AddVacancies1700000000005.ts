import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La tabla de vacantes ingeridas.
 *
 * El indice unico es la pieza que importa: sin el, cada refresco diario duplicaria
 * las 1615 pegas en vez de actualizarlas.
 *
 * Timestamp 1700000000005: el PR #2 (fix/offer-triage-jev-parsing) ya usa el
 * 1700000000004 para AddOfferFitScore. Reusarlo hacia que TypeORM viera esta
 * migracion como ya aplicada en cualquier base donde el PR #2 haya corrido, y
 * la tabla nunca se creaba.
 */
export class AddVacancies1700000000005 implements MigrationInterface {
  name = 'AddVacancies1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS vacancies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        source text NOT NULL,
        portal text,
        "externalId" text NOT NULL,
        title text NOT NULL,
        company text,
        location text,
        category text,
        salary text,
        url text,
        "postedAt" date,
        description text,
        "scoredFrom" text NOT NULL DEFAULT 'index',
        score double precision NOT NULL DEFAULT 0,
        breakdown jsonb,
        admitted boolean NOT NULL DEFAULT false,
        "rejectReason" text,
        "scoredAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_vacancies_user_source_external ON vacancies ("userId", source, "externalId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_vacancies_user_score ON vacancies ("userId", score)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_vacancies_user_score`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_vacancies_user_source_external`);
    await queryRunner.query(`DROP TABLE IF EXISTS vacancies`);
  }
}
