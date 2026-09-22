import AppDataSource from '../data-source';
import * as bcrypt from 'bcryptjs';
import { Application } from '../applications/application.entity';
import { SOURCES, STAGES } from '../applications/stage.constants';
import { User } from '../users/user.entity';

// The demo user is what makes this seed useful. Without a row in `users` that
// carries this id, the sample applications belong to nobody and stay invisible
// from the UI, which made the seed a schema check instead of sample data. The
// credentials are published in the README so anyone evaluating a self-hosted
// instance can log in and look around.
export const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';
export const DEMO_EMAIL = 'demo@example.com';
export const DEMO_PASSWORD = 'demo1234';

export async function seed(): Promise<number> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  const apps = AppDataSource.getRepository(Application);
  const users = AppDataSource.getRepository(User);

  // Scoped to the demo user on purpose. A blanket clear() of the applications
  // table destroys real data on a self-hosted instance whose owner runs this
  // command expecting sample rows.
  await apps.delete({ user_id: DEMO_USER_ID });
  await users.delete({ id: DEMO_USER_ID });

  await users.insert({
    id: DEMO_USER_ID,
    email: DEMO_EMAIL,
    password_hash: await bcrypt.hash(DEMO_PASSWORD, 10),
  });

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const rows: Application[] = [
    {
      id: crypto.randomUUID(),
      user_id: DEMO_USER_ID,
      company: 'Acme Corp',
      role: 'Senior Developer',
      source: SOURCES.LINKEDIN,
      stage: STAGES.SAVED,
      applied_date: yesterday,
      follow_up_date: nextWeek,
      notes: 'Applied via LinkedIn',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: crypto.randomUUID(),
      user_id: DEMO_USER_ID,
      company: 'Globex Inc',
      role: 'Frontend Engineer',
      source: SOURCES.INDEED,
      stage: STAGES.APPLIED,
      applied_date: yesterday,
      follow_up_date: nextWeek,
      notes: 'Recruiter contacted',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: crypto.randomUUID(),
      user_id: DEMO_USER_ID,
      company: 'Initech',
      role: 'Full Stack Developer',
      source: SOURCES.REFERRAL,
      stage: STAGES.SCREENED,
      applied_date: yesterday,
      follow_up_date: nextWeek,
      notes: 'Interview scheduled for next week',
      created_at: new Date(),
      updated_at: new Date(),
    },
  ];

  for (const row of rows) {
    await apps.save(row);
  }

  return rows.length;
}

// ts-node runs this file directly. Importing it, which the spec does, must not
// touch a database.
if (require.main === module) {
  seed()
    .then((count) => {
      console.log(`Seeded the demo user ${DEMO_EMAIL} with ${count} applications`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
