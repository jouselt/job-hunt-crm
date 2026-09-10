import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import * as request from 'supertest';
import { Application } from '../src/applications/application.entity';
import { ApplicationsModule } from '../src/applications/applications.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';

const SECRET = 'e2e-secret';

/**
 * HTTP-layer isolation test: user A must never see or mutate user B's
 * application (404), even though the service layer already scopes by user_id.
 *
 * The repository is faked in-memory so the test exercises the full Nest HTTP
 * stack (guard -> controller -> service -> scoped query) without a live DB.
 */
describe('Applications e2e isolation (HTTP)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  // In-memory fake repository.
  const store = new Map<string, Application>();
  let calls = { find: 0, findOne: 0 };

  const repo = {
    find: jest.fn(async ({ where }: any) => {
      calls.find += 1;
      return Array.from(store.values()).filter(
        (a) => a.user_id === where.user_id,
      );
    }),
    findOne: jest.fn(async ({ where }: any) => {
      calls.findOne += 1;
      const match = Array.from(store.values()).find(
        (a) => a.id === where.id && a.user_id === where.user_id,
      );
      return match ?? null;
    }),
    create: jest.fn((partial: any) => partial),
    save: jest.fn(async (app: Application) => {
      const rec = { ...app, id: app.id ?? 'gen-id' };
      store.set(rec.id as string, rec);
      return rec;
    }),
    clear: jest.fn(async () => store.clear()),
  };

  const makeApp = (overrides: Partial<Application> = {}): Application =>
    ({
      id: require('crypto').randomUUID(),
      user_id: '',
      company: 'Acme',
      role: 'Engineer',
      source: 'linkedin',
      stage: 'applied',
      applied_date: '2026-01-01',
      follow_up_date: null,
      notes: '',
      ...overrides,
    }) as Application;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: SECRET, signOptions: { expiresIn: '1d' } }),
      ],
    }).compile();

    jwt = moduleRef.get(JwtService);

    // Mount the applications feature with the fake repo.
    const appModuleRef = await Test.createTestingModule({
      imports: [ApplicationsModule],
    })
      .overrideProvider(getRepositoryToken(Application))
      .useValue(repo)
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          const req = ctx.switchToHttp().getRequest();
          const auth = (req.headers?.authorization ?? '') as string;
          const token = auth.replace(/^Bearer\s+/i, '');
          const payload = jwt.verify(token) as { sub: string; email: string };
          req.user = { userId: payload.sub, email: payload.email };
          return true;
        },
      })
      .compile();

    app = appModuleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    store.clear();
    calls = { find: 0, findOne: 0 };
    jest.clearAllMocks();
  });

  const tokenFor = (userId: string) => jwt.sign({ sub: userId, email: 'a@b.c' });

  it('user A cannot read user B application via GET /applications/:id', () => {
    // Seed user B's application.
    const userBApp = makeApp({ user_id: 'user-b', company: 'B Corp' });
    store.set(userBApp.id, userBApp);

    return request(app.getHttpServer())
      .get(`/applications/${userBApp.id}`)
      .set('Authorization', `Bearer ${tokenFor('user-a')}`)
      .expect(404);
  });

  it('user A cannot promote user B application stage', () => {
    const userBApp = makeApp({ user_id: 'user-b', company: 'B Corp' });
    store.set(userBApp.id, userBApp);

    return request(app.getHttpServer())
      .patch(`/applications/${userBApp.id}/stage`)
      .set('Authorization', `Bearer ${tokenFor('user-a')}`)
      .send({ stage: 'screened' })
      .expect(404);
  });

  it('lists only the authenticated user own applications', async () => {
    store.set(
      'a1',
      makeApp({ id: 'a1', user_id: 'user-a', company: 'A Corp' }),
    );
    store.set(
      'b1',
      makeApp({ id: 'b1', user_id: 'user-b', company: 'B Corp' }),
    );

    const res = await request(app.getHttpServer())
      .get('/applications')
      .set('Authorization', `Bearer ${tokenFor('user-a')}`)
      .expect(200);

    const bodies = res.body as any[];
    expect(bodies).toHaveLength(1);
    expect(bodies[0].id).toBe('a1');
  });
});