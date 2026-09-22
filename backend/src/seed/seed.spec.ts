import * as bcrypt from 'bcryptjs';

const mockUserRows: any[] = [];
const mockAppRows: any[] = [];

const mockUsersRepo = {
  delete: jest.fn(async () => {
    mockUserRows.length = 0;
  }),
  insert: jest.fn(async (row: any) => {
    mockUserRows.push(row);
    return row;
  }),
};

const mockAppsRepo = {
  clear: jest.fn(async () => {
    mockAppRows.length = 0;
  }),
  delete: jest.fn(async () => {
    mockAppRows.length = 0;
  }),
  save: jest.fn(async (row: any) => {
    mockAppRows.push(row);
    return row;
  }),
};

jest.mock('../data-source', () => ({
  __esModule: true,
  default: {
    isInitialized: true,
    initialize: jest.fn(async () => undefined),
    getRepository: (entity: { name: string }) =>
      entity.name === 'User' ? mockUsersRepo : mockAppsRepo,
  },
}));

import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_USER_ID, seed } from './seed';

describe('seed', () => {
  beforeEach(() => {
    mockUserRows.length = 0;
    mockAppRows.length = 0;
    jest.clearAllMocks();
  });

  it('creates a demo user whose password verifies against the published credential', async () => {
    await seed();

    expect(mockUsersRepo.insert).toHaveBeenCalledTimes(1);
    const row = mockUsersRepo.insert.mock.calls[0][0] as any;

    expect(row.id).toBe(DEMO_USER_ID);
    expect(row.email).toBe(DEMO_EMAIL);
    expect(row.password_hash).not.toBe(DEMO_PASSWORD);
    expect(await bcrypt.compare(DEMO_PASSWORD, row.password_hash)).toBe(true);
  });

  it('attaches the sample applications to the demo user so they are visible in the UI', async () => {
    const count = await seed();

    expect(count).toBe(3);
    expect(mockAppRows).toHaveLength(3);
    for (const row of mockAppRows) {
      expect(row.user_id).toBe(DEMO_USER_ID);
    }
  });

  it('never clears the applications table, only the demo user rows', async () => {
    await seed();

    // A blanket clear() would wipe every real application on a self-hosted
    // instance whose owner runs the seed expecting sample data.
    expect(mockAppsRepo.clear).not.toHaveBeenCalled();
    expect(mockAppsRepo.delete).toHaveBeenCalledWith({ user_id: DEMO_USER_ID });
    expect(mockUsersRepo.delete).toHaveBeenCalledWith({ id: DEMO_USER_ID });
  });
});
