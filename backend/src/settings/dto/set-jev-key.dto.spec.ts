import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SetJevKeyDto, JEV_KEY_PATTERN } from './set-jev-key.dto';

/** Validate the way the global ValidationPipe does: transform, then validate. */
async function check(payload: any) {
  const dto = plainToInstance(SetJevKeyDto, payload);
  return { dto, errors: await validate(dto) };
}

describe('SetJevKeyDto', () => {
  it('accepts a single-line token', async () => {
    const { errors } = await check({ key: 'apik_example_token_value_1234567890' });
    expect(errors).toHaveLength(0);
  });

  it('trims surrounding whitespace before storing', async () => {
    const { dto, errors } = await check({ key: '  apik_example_token_value  ' });
    expect(errors).toHaveLength(0);
    expect(dto.key).toBe('apik_example_token_value');
  });

  it('rejects a pasted JSON document, which is the real regression', async () => {
    // 9.5 KB of profile JSON was once accepted as an "API key": the write
    // succeeded, the UI confirmed it, and the failure only appeared later as a
    // 401 inside a triage run.
    const profileJson = JSON.stringify({
      roles: ['Senior Fullstack Developer'],
      skills: Array.from({ length: 400 }, (_, i) => `skill-${i}`),
      notes: 'pasted into the wrong field',
    });
    const { errors } = await check({ key: profileJson });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a multi-line value', async () => {
    const { errors } = await check({ key: 'apik_first_line\nsecond_line' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a value with an internal space', async () => {
    const { errors } = await check({ key: 'apik token with spaces' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects values that are too short to be a key', async () => {
    const { errors } = await check({ key: 'abc' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a value longer than the limit', async () => {
    const { errors } = await check({ key: 'a'.repeat(513) });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('does not hardcode a vendor prefix', async () => {
    // Any single-line token passes; the rule must not assume TypeSafe's format.
    expect(JEV_KEY_PATTERN.test('someothervendor_key-1234567890')).toBe(true);
  });
});
