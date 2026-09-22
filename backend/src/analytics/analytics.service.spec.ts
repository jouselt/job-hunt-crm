import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Application } from '../applications/application.entity';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  const repo = {
    count: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: getRepositoryToken(Application), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(AnalyticsService);
  });

  it('returns canonical keys with counts and percentages summing to 100%', async () => {
    repo.count.mockImplementation(({ where }: { where: { stage: string } }) => {
      const map: Record<string, number> = {
        applied: 4,
        screened: 3,
        interview: 2,
        offer: 1,
        rejected: 2,
      };
      return Promise.resolve(map[where.stage] ?? 0);
    });
    repo.find.mockResolvedValue([{ applied_date: '2026-01-01' }]);

    const stats = await service.getPipelineStats('user-1');

    expect(stats.applied.count).toBe(4);
    expect(stats.screened.count).toBe(3);
    expect(stats.interview.count).toBe(2);
    expect(stats.offer.count).toBe(1);
    expect(stats.rejected.count).toBe(2);

    // active total = 10; percentages sum to 100
    expect(stats.applied.pct).toBe(40);
    expect(stats.screened.pct).toBe(30);
    expect(stats.interview.pct).toBe(20);
    expect(stats.offer.pct).toBe(10);
    const sum = stats.applied.pct + stats.screened.pct + stats.interview.pct + stats.offer.pct;
    expect(sum).toBe(100);

    // rejected is excluded from active % denominator and reported separately
    expect(stats.rejected).toEqual({ count: 2 });
  });

  it('returns zero percentages when there are no active applications', async () => {
    repo.count.mockResolvedValue(0);
    repo.find.mockResolvedValue([]);

    const stats = await service.getPipelineStats('user-1');

    expect(stats.applied).toEqual({ count: 0, pct: 0 });
    expect(stats.offer).toEqual({ count: 0, pct: 0 });
    expect(stats.avgDaysInStage).toBe(0);
  });

  it('reports avgDaysInStage as a numeric value', async () => {
    repo.count.mockResolvedValue(0);
    const dayMs = 86400000;
    const now = new Date();
    repo.find.mockResolvedValue([
      { applied_date: new Date(now.getTime() - 10 * dayMs).toISOString().slice(0, 10) },
      { applied_date: new Date(now.getTime() - 20 * dayMs).toISOString().slice(0, 10) },
    ]);

    const stats = await service.getPipelineStats('user-1');
    expect(typeof stats.avgDaysInStage).toBe('number');
    expect(stats.avgDaysInStage).toBeGreaterThan(0);
  });

  it('cuenta las guardadas y las suma al total activo', async () => {
    // Guardar un aviso es estar en el pipeline, no estar muerto: si `saved` quedara
    // fuera del denominador, las barras de la vista no sumarian 100.
    repo.count.mockImplementation(({ where }: { where: { stage: string } }) =>
      Promise.resolve(where.stage === 'saved' ? 5 : where.stage === 'applied' ? 5 : 0),
    );
    repo.find.mockResolvedValue([]);

    const stats = await service.getPipelineStats('user-1');

    expect(stats.saved.count).toBe(5);
    expect(stats.saved.pct).toBe(50);
    expect(stats.applied.pct).toBe(50);
    expect(stats.saved.pct + stats.applied.pct).toBe(100);
  });

  it('no cuenta las guardadas en el promedio de dias, y no devuelve NaN', async () => {
    // `applied_date` es nula mientras la fila esta guardada, y `null + 'T00:00:00Z'`
    // da Invalid Date: el promedio se volvia NaN sin fallar, y el bug se veia en la
    // pantalla, no en el test.
    repo.count.mockResolvedValue(0);
    const dayMs = 86400000;
    const now = new Date();
    repo.find.mockResolvedValue([
      { applied_date: null },
      { applied_date: new Date(now.getTime() - 10 * dayMs).toISOString().slice(0, 10) },
    ]);

    const stats = await service.getPipelineStats('user-1');

    expect(Number.isNaN(stats.avgDaysInStage)).toBe(false);
    // Solo la que tiene fecha entra al promedio: 10 dias, no el promedio de dos.
    expect(stats.avgDaysInStage).toBe(10);
  });
});