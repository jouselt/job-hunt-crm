import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { Application } from './application.entity';
import { ApplicationsService } from './applications.service';

/**
 * Este servicio no tenia spec. Ahora tiene, porque aca vive la regla que decide
 * cuando una fila del pipeline puede decir que postulaste.
 */
describe('ApplicationsService', () => {
  let service: ApplicationsService;
  let saved: any[];

  const setup = async (rows: Application[] = []) => {
    saved = [];
    const repo = {
      create: jest.fn((dto: any) => ({ ...dto })),
      save: jest.fn(async (row: any) => {
        saved.push(row);
        return row;
      }),
      find: jest.fn(async () => rows),
      findOne: jest.fn(
        async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null,
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ApplicationsService,
        { provide: getRepositoryToken(Application), useValue: repo },
      ],
    }).compile();

    service = moduleRef.get(ApplicationsService);
  };

  const hoy = () => new Date().toISOString().slice(0, 10);

  describe('create', () => {
    it('una fila guardada no tiene fecha de postulacion', async () => {
      // Guardar un aviso no es postular. Antes el esquema lo forzaba (NOT NULL) y
      // Track escribia la fecha de hoy: el pipeline registraba una postulacion que
      // no existio, indistinguible de una real.
      await setup();

      const app = await service.create(
        { company: 'Acme', role: 'Dev', source: 'other', stage: 'saved' } as any,
        'user-1',
      );

      expect(app.stage).toBe('saved');
      expect(app.applied_date).toBeNull();
    });

    it('una postulacion sin fecha explicita usa la de hoy', async () => {
      await setup();

      const app = await service.create(
        { company: 'Acme', role: 'Dev', source: 'other' } as any,
        'user-1',
      );

      expect(app.stage).toBe('applied');
      expect(app.applied_date).toBe(hoy());
    });

    it('respeta la fecha explicita aunque la fila este guardada', async () => {
      await setup();

      const app = await service.create(
        {
          company: 'Acme',
          role: 'Dev',
          source: 'other',
          stage: 'saved',
          applied_date: '2026-09-01',
        } as any,
        'user-1',
      );

      expect(app.applied_date).toBe('2026-09-01');
    });
  });

  describe('promoteStage', () => {
    const fila = (over: Partial<Application> = {}) =>
      ({ id: 'a', stage: 'saved', applied_date: null, follow_up_date: null, ...over }) as Application;

    it('sella la fecha de postulacion al llegar a applied', async () => {
      // Es el dia en que postulaste de verdad, no el dia en que guardaste la fila.
      await setup([fila()]);

      const app = await service.promoteStage('user-1', 'a', { stage: 'applied' } as any);

      expect(app.stage).toBe('applied');
      expect(app.applied_date).toBe(hoy());
      expect(saved).toHaveLength(1);
    });

    it('no pisa una fecha de postulacion que ya existia', async () => {
      await setup([fila({ applied_date: '2026-09-01' })]);

      const app = await service.promoteStage('user-1', 'a', { stage: 'applied' } as any);

      expect(app.applied_date).toBe('2026-09-01');
    });

    it('no permite saltar de guardada a screened', async () => {
      await setup([fila()]);

      await expect(
        service.promoteStage('user-1', 'a', { stage: 'screened' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(saved).toHaveLength(0);
    });
  });
});
