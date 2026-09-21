import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { ApplicationsService } from '../applications/applications.service';
import { ALL_SOURCES } from '../applications/stage.constants';
import { Offer } from '../offer-triage/offer.entity';
import { DEFAULT_TRIAGE_PROFILE } from '../offer-triage/profile.default';
import { TriageProfileService } from '../offer-triage/triage-profile.service';
import { VacanciesService } from './vacancies.service';
import { Vacancy } from './vacancy.entity';

const USER = 'user-1';
const VACANCY_ID = '11111111-1111-4111-8111-111111111111';

/**
 * Lo que `scoreboard` lee de una vacante guardada: usa el `breakdown` ya calculado
 * en la ingesta, no vuelve a puntuar.
 */
const BREAKDOWN = {
  score: 27,
  matchedSkills: ['Angular', 'TypeScript'],
  titleSkills: ['Angular'],
  primaryMatches: 1,
  signals: ['remote'],
};

function vacancy(over: Partial<Vacancy> = {}): Vacancy {
  return {
    id: VACANCY_ID,
    userId: USER,
    source: 'pegas-devschile',
    title: 'Developer Front End Web Senior (Angular / RxJS / NgRx)',
    company: 'Sermaluc',
    location: 'Chile',
    salary: null,
    category: null,
    url: 'https://www.linkedin.com/jobs/view/4462857661/',
    postedAt: null,
    scoredFrom: 'index',
    score: 27,
    breakdown: BREAKDOWN,
    admitted: true,
    rejectReason: null,
    ...over,
  } as Vacancy;
}

describe('VacanciesService', () => {
  let service: VacanciesService;
  let created: any[];
  let alreadyTracked: string[];
  let saved: Vacancy[];

  const setup = async (rows: Vacancy[], tracked: string[] = []) => {
    created = [];
    alreadyTracked = tracked;
    saved = [];

    const vacancyRepo = {
      find: jest.fn(async () => rows),
      findOne: jest.fn(
        async ({ where }: any) =>
          rows.find((r) => r.id === where.id && r.userId === where.userId) ?? null,
      ),
      save: jest.fn(async (row: Vacancy) => {
        saved.push(row);
        return row;
      }),
    };
    const offerRepo = { find: jest.fn(async () => []) };

    const applications = {
      trackedVacancyIds: jest.fn(async () => alreadyTracked),
      findByVacancy: jest.fn(async (_userId: string, id: string) =>
        alreadyTracked.includes(id) ? { id: 'app-existing', vacancyId: id } : null,
      ),
      create: jest.fn(async (dto: any) => {
        created.push(dto);
        return { id: 'app-new', ...dto };
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        VacanciesService,
        { provide: getRepositoryToken(Vacancy), useValue: vacancyRepo },
        { provide: getRepositoryToken(Offer), useValue: offerRepo },
        {
          provide: TriageProfileService,
          useValue: { getForUser: jest.fn(async () => DEFAULT_TRIAGE_PROFILE) },
        },
        { provide: ApplicationsService, useValue: applications },
      ],
    }).compile();

    service = moduleRef.get(VacanciesService);
  };

  describe('scoreboard', () => {
    it('reporta el maximo de la lista para poder mostrar el puntaje como relativo', async () => {
      await setup([vacancy({ id: 'a', score: 27 }), vacancy({ id: 'b', score: 9 })]);

      const board = await service.scoreboard(USER);

      expect(board.meta.maxScore).toBe(27);
    });

    it('marca la vacante que ya se convirtio en postulacion', async () => {
      await setup([vacancy({ id: 'a' }), vacancy({ id: 'b' })], ['a']);

      const board = await service.scoreboard(USER);

      const byId = new Map(board.items.map((item) => [item.id, item]));
      expect(byId.get('a')?.tracked).toBe(true);
      expect(byId.get('b')?.tracked).toBe(false);
    });
  });

  describe('track', () => {
    it('crea la postulacion mapeando empresa, rol, url y vacante', async () => {
      await setup([vacancy()]);

      const result = await service.track(USER, VACANCY_ID);

      expect(result).toEqual({ created: true, applicationId: 'app-new' });
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        company: 'Sermaluc',
        role: 'Developer Front End Web Senior (Angular / RxJS / NgRx)',
        source: 'linkedin',
        vacancyId: VACANCY_ID,
      });
      expect(created[0].notes).toContain('linkedin.com/jobs/view/4462857661');
    });

    it('no duplica la postulacion si la vacante ya estaba trackeada', async () => {
      await setup([vacancy()], [VACANCY_ID]);

      const result = await service.track(USER, VACANCY_ID);

      expect(result).toEqual({ created: false, applicationId: 'app-existing' });
      expect(created).toHaveLength(0);
    });

    it('rechaza una vacante que no pertenece al usuario', async () => {
      await setup([vacancy()]);

      await expect(
        service.track(USER, '22222222-2222-4222-8222-222222222222'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(created).toHaveLength(0);
    });

    it('usa un nombre de empresa por defecto cuando el feed no la trae', async () => {
      await setup([vacancy({ company: null })]);

      await service.track(USER, VACANCY_ID);

      expect(created[0].company).toBe('Sin empresa');
    });

    /**
     * `applications.source` tiene un CHECK en la base con una lista cerrada. Un
     * valor inventado no falla en TypeScript ni en los tests de arriba: falla en el
     * insert, en produccion, con un error que el usuario no puede resolver.
     */
    it('nunca mapea un source fuera de la lista cerrada de la base', async () => {
      const urls = [
        'https://www.linkedin.com/jobs/view/1',
        'https://www.getonbrd.com/jobs/x',
        'https://jobicy.com/jobs/y',
        null,
      ];

      for (const url of urls) {
        await setup([vacancy({ url })]);
        await service.track(USER, VACANCY_ID);

        expect(ALL_SOURCES).toContain(created[0].source);
      }
    });

    it('manda a other cualquier portal que no sea LinkedIn', async () => {
      await setup([vacancy({ url: 'https://www.getonbrd.com/jobs/x' })]);

      await service.track(USER, VACANCY_ID);

      expect(created[0].source).toBe('other');
    });
  });

  describe('dismiss', () => {
    it('marca el aviso como cerrado y lo guarda', async () => {
      await setup([vacancy()]);

      const result = await service.dismiss(USER, VACANCY_ID);

      expect(result).toEqual({ dismissed: true });
      expect(saved).toHaveLength(1);
      expect(saved[0].dismissedAt).toBeInstanceOf(Date);
    });

    it('saca el aviso de la lista pero lo devuelve aparte, no lo borra', async () => {
      // Esconder sin vuelta seria peor que el ruido que saca: en un telefono un
      // toque se pierde, y el usuario tiene que poder recuperarlo.
      await setup([
        vacancy({ id: 'a' }),
        vacancy({ id: 'b', dismissedAt: new Date() }),
      ]);

      const board = await service.scoreboard(USER);

      expect(board.items.map((i) => i.id)).toEqual(['a']);
      expect(board.dismissed.map((i) => i.id)).toEqual(['b']);
      expect(board.totals.dismissed).toBe(1);
      expect(board.totals.admitted).toBe(1);
    });

    it('no deja que un aviso cerrado ponga el techo del puntaje relativo', async () => {
      // El relativo se mide contra el mejor EN JUEGO: si el descartado mandara, el
      // 100 quedaria en algo que el usuario ya decidio no mirar.
      await setup([
        vacancy({ id: 'a', score: 9 }),
        vacancy({ id: 'b', score: 27, dismissedAt: new Date() }),
      ]);

      const board = await service.scoreboard(USER);

      expect(board.meta.maxScore).toBe(9);
    });

    it('es idempotente: repetir el toque no vuelve a escribir', async () => {
      await setup([vacancy({ dismissedAt: new Date() })]);

      const result = await service.dismiss(USER, VACANCY_ID);

      expect(result).toEqual({ dismissed: true });
      expect(saved).toHaveLength(0);
    });

    it('rechaza una vacante que no pertenece al usuario', async () => {
      await setup([vacancy()]);

      await expect(
        service.dismiss(USER, '22222222-2222-4222-8222-222222222222'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(saved).toHaveLength(0);
    });
  });

  describe('restore', () => {
    it('devuelve el aviso a la lista', async () => {
      await setup([vacancy({ dismissedAt: new Date() })]);

      const result = await service.restore(USER, VACANCY_ID);

      expect(result).toEqual({ dismissed: false });
      expect(saved).toHaveLength(1);
      expect(saved[0].dismissedAt).toBeNull();
    });

    it('no escribe si el aviso no estaba marcado', async () => {
      await setup([vacancy()]);

      const result = await service.restore(USER, VACANCY_ID);

      expect(result).toEqual({ dismissed: false });
      expect(saved).toHaveLength(0);
    });
  });
});
