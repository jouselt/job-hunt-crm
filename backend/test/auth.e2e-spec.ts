import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as request from 'supertest';
import { AuthModule } from '../src/auth/auth.module';
import { User } from '../src/users/user.entity';
import { JwtService } from '@nestjs/jwt';

/**
 * HTTP-layer auth test: real registration + credential-verified login using an
 * in-memory user repository (bcrypt hashes the password for real).
 */
describe('Auth e2e (HTTP)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  const store = new Map<string, User>();
  const repo = {
    findOne: jest.fn(async ({ where }: any) => {
      const key = where.email ?? where.id;
      return store.get(key) ?? null;
    }),
    create: jest.fn((partial: any) => partial),
    save: jest.fn(async (u: User) => {
      const rec = { ...u, id: u.id ?? require('crypto').randomUUID() };
      store.set(rec.email, rec);
      store.set(rec.id, rec);
      return rec;
    }),
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'e2e-secret';

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule],
    })
      .overrideProvider(getRepositoryToken(User))
      .useValue(repo)
      .compile();

    jwt = moduleRef.get(JwtService);
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();
  });

  it('registers a new user and returns a JWT bound to that user', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'dev@example.com', password: 'secret123' })
      .expect(201);

    const token = res.body.access_token;
    expect(token).toBeDefined();
    const payload = jwt.verify(token) as { sub: string; email: string };
    expect(payload.email).toBe('dev@example.com');
    expect(payload.sub).toBeDefined();

    // Stored password is hashed, never plaintext.
    const stored = store.get('dev@example.com') as User;
    expect(stored.password_hash).not.toBe('secret123');
    expect(await bcrypt.compare('secret123', stored.password_hash)).toBe(true);
  });

  it('logs in with valid credentials', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'dev@example.com', password: 'secret123' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'dev@example.com', password: 'secret123' })
      .expect(200);

    const payload = jwt.verify(res.body.access_token) as { sub: string };
    expect(payload.sub).toBeDefined();
  });

  it('rejects login with wrong password (401, no token)', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'dev@example.com', password: 'secret123' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'dev@example.com', password: 'wrongpass' })
      .expect(401);

    expect(res.body.access_token).toBeUndefined();
  });

  it('rejects login with unknown email (401)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: 'whatever' })
      .expect(401);

    expect(res.body.access_token).toBeUndefined();
  });

  it('rejects duplicate registration (409)', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'dev@example.com', password: 'secret123' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'dev@example.com', password: 'secret123' })
      .expect(409);
  });
});