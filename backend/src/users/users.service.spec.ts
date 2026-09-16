import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
import { User } from './user.entity';

describe('UsersService', () => {
  let service: UsersService;
  const store = new Map<string, User>();

  const repo = {
    findOne: jest.fn(async ({ where }: any) => store.get(where.email ?? where.id) ?? null),
    create: jest.fn((partial: any) => partial),
    save: jest.fn(async (u: User) => {
      const rec = { ...u, id: u.id ?? 'u-1' };
      store.set(rec.email, rec);
      store.set(rec.id, rec);
      return rec;
    }),
  };

  beforeEach(async () => {
    store.clear();
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('hashes password with bcrypt (never stores plaintext)', async () => {
    const user = await service.create('Dev@Example.com', 'secret123');
    expect(user.password_hash).not.toBe('secret123');
    expect(await bcrypt.compare('secret123', user.password_hash)).toBe(true);
    expect(user.email).toBe('dev@example.com'); // normalized lowercase/trimmed
  });

  it('rejects duplicate email (case-insensitive)', async () => {
    await service.create('dev@example.com', 'secret123');
    await expect(
      service.create('DEV@example.com', 'other123'),
    ).rejects.toThrow(ConflictException);
  });

  it('verifies a correct password and rejects an incorrect one', async () => {
    const user = await service.create('dev@example.com', 'secret123');
    await expect(service.verifyPassword(user, 'secret123')).resolves.toBe(true);
    await expect(service.verifyPassword(user, 'wrong')).resolves.toBe(false);
  });
});