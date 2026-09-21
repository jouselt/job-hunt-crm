import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enlaza una postulacion con la vacante de la que salio.
 *
 * El tablero convierte una vacante del feed en una postulacion con un click, y esta
 * columna es lo que hace que eso sea idempotente: el indice unico parcial permite
 * una sola postulacion por vacante por usuario, asi que un segundo click no puede
 * crear un duplicado.
 *
 * Timestamp 1700000000006: el 1700000000005 ya lo usa AddVacancies.
 */
export class AddApplicationVacancyLink1700000000006 implements MigrationInterface {
  name = 'AddApplicationVacancyLink1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE applications ADD COLUMN IF NOT EXISTS "vacancyId" uuid REFERENCES vacancies(id) ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_user_vacancy ON applications (user_id, "vacancyId") WHERE "vacancyId" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_applications_user_vacancy`);
    await queryRunner.query(
      `ALTER TABLE applications DROP COLUMN IF EXISTS "vacancyId"`,
    );
  }
}
