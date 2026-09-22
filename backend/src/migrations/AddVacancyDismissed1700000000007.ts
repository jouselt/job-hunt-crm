import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marca de "ya no esta" en una vacante.
 *
 * El feed no publica si un aviso sigue abierto: LinkedIn lo cierra y la fila se
 * queda con su puntaje, arriba del ranking. Averiguarlo sondeando LinkedIn seria
 * abuso y ademas poco fiable (sirve markup distinto a los bots), asi que la unica
 * fuente confiable es el usuario, y esto lo recuerda.
 */
export class AddVacancyDismissed1700000000007 implements MigrationInterface {
  name = 'AddVacancyDismissed1700000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "vacancies" ADD "dismissedAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "vacancies" DROP COLUMN "dismissedAt"`);
  }
}
