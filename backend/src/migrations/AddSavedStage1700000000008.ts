import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `saved` como primera etapa del pipeline, y la fecha de postulacion opcional.
 *
 * Track creaba la postulacion en `applied`: registraba "postule" en el momento en
 * que el usuario solo marcaba interes, con la fecha de ese dia. El esquema lo
 * forzaba, porque `applied_date` era NOT NULL y una fila guardada no tenia forma
 * de no mentir. Ahora la fecha se sella cuando la fila LLEGA a applied.
 */
export class AddSavedStage1700000000008 implements MigrationInterface {
  name = 'AddSavedStage1700000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // El CHECK de `stage` es una lista cerrada. Sin recrearlo, guardar una fila
    // `saved` falla en la base con un error que el usuario no puede resolver desde
    // la pantalla, y que ni TypeScript ni los tests unitarios ven.
    await queryRunner.query(
      `ALTER TABLE "applications" DROP CONSTRAINT "applications_stage_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" ADD CONSTRAINT "applications_stage_check" CHECK ("stage" IN ('saved','applied','screened','interview','offer','rejected'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" ALTER COLUMN "applied_date" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Volver atras obliga a decidir que hacer con las filas guardadas. Se les pone
    // la fecha de creacion: es el dato mas cercano y no inventa un dia nuevo. Y
    // vuelven a `applied`, porque la etapa `saved` deja de existir.
    await queryRunner.query(
      `UPDATE "applications" SET "applied_date" = "created_at"::date WHERE "applied_date" IS NULL`,
    );
    await queryRunner.query(`UPDATE "applications" SET "stage" = 'applied' WHERE "stage" = 'saved'`);
    await queryRunner.query(
      `ALTER TABLE "applications" ALTER COLUMN "applied_date" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" DROP CONSTRAINT "applications_stage_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "applications" ADD CONSTRAINT "applications_stage_check" CHECK ("stage" IN ('applied','screened','interview','offer','rejected'))`,
    );
  }
}
