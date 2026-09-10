import AppDataSource from '../data-source';
import { Application } from '../applications/application.entity';
import { ALL_SOURCES, ALL_STAGES } from '../applications/stage.constants';

async function seed() {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  const repo = AppDataSource.getRepository(Application);

  // Clear existing data
  await repo.clear();

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const apps: Application[] = [
    {
      id: crypto.randomUUID(),
      user_id: '00000000-0000-0000-0000-000000000001',
      company: 'Acme Corp',
      role: 'Senior Developer',
      source: ALL_SOURCES[0], // linkedin
      stage: ALL_STAGES[0], // applied
      applied_date: yesterday,
      follow_up_date: nextWeek,
      notes: 'Applied via LinkedIn',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: crypto.randomUUID(),
      user_id: '00000000-0000-0000-0000-000000000001',
      company: 'Globex Inc',
      role: 'Frontend Engineer',
      source: ALL_SOURCES[1], // indeed
      stage: ALL_STAGES[1], // screened
      applied_date: yesterday,
      follow_up_date: nextWeek,
      notes: 'Recruiter contacted',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: crypto.randomUUID(),
      user_id: '00000000-0000-0000-0000-000000000001',
      company: 'Initech',
      role: 'Full Stack Developer',
      source: ALL_SOURCES[2], // referral
      stage: ALL_STAGES[2], // interview
      applied_date: yesterday,
      follow_up_date: nextWeek,
      notes: 'Interview scheduled for next week',
      created_at: new Date(),
      updated_at: new Date(),
    },
  ];

  for (const app of apps) {
    await repo.save(app);
  }

  console.log('Seeded 3 applications for test user');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
