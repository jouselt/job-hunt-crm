import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';

describe('AuthService', () => {
  let auth: AuthService;
  let users: {
    create: jest.Mock;
    findByEmail: jest.Mock;
    verifyPassword: jest.Mock;
  };
  const jwt = { sign: jest.fn((payload) => `token-${payload.sub}`) };

  const user = (id = 'u-1', email = 'dev@example.com'): User =>
    ({ id, email, password_hash: 'hash' }) as User;

  beforeEach(async () => {
    jest.clearAllMocks();
    users = {
      create: jest.fn(),
      findByEmail: jest.fn(),
      verifyPassword: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();
    auth = moduleRef.get(AuthService);
  });

  it('register hashes password via UsersService and issues a token', async () => {
    users.create.mockResolvedValue(user('u-1', 'dev@example.com'));
    const result = await auth.register({
      email: 'dev@example.com',
      password: 'secret123',
    });

    expect(users.create).toHaveBeenCalledWith('dev@example.com', 'secret123');
    expect(result.access_token).toBe('token-u-1');
    expect(result.user.email).toBe('dev@example.com');
  });

  it('register propagates duplicate-email conflict', async () => {
    users.create.mockRejectedValue(new ConflictException('Email is already registered'));
    await expect(
      auth.register({ email: 'dev@example.com', password: 'secret123' }),
    ).rejects.toThrow(ConflictException);
  });

  it('login issues token on valid credentials', async () => {
    users.findByEmail.mockResolvedValue(user('u-1', 'dev@example.com'));
    users.verifyPassword.mockResolvedValue(true);

    const result = await auth.login({
      email: 'dev@example.com',
      password: 'secret123',
    });

    expect(users.verifyPassword).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'dev@example.com' }),
      'secret123',
    );
    expect(result.access_token).toBe('token-u-1');
  });

  it('login rejects unknown email with 401', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(
      auth.login({ email: 'ghost@example.com', password: 'whatever' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(users.verifyPassword).not.toHaveBeenCalled();
  });

  it('login rejects wrong password with 401', async () => {
    users.findByEmail.mockResolvedValue(user('u-1', 'dev@example.com'));
    users.verifyPassword.mockResolvedValue(false);
    await expect(
      auth.login({ email: 'dev@example.com', password: 'wrongpass' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});