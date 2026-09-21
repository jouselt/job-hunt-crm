import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateApplicationDto } from './create-application.dto';
import { UpdateStageDto } from './update-stage.dto';

describe('CreateApplicationDto', () => {
  it('accepts a valid payload', async () => {
    const dto = plainToInstance(CreateApplicationDto, {
      company: 'Acme',
      role: 'Engineer',
      source: 'linkedin',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a missing company', async () => {
    const dto = plainToInstance(CreateApplicationDto, { role: 'Engineer' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'company')).toBe(true);
  });

  it('rejects an empty company string', async () => {
    const dto = plainToInstance(CreateApplicationDto, {
      company: '',
      role: 'Engineer',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'company')).toBe(true);
  });

  it('rejects a missing role', async () => {
    const dto = plainToInstance(CreateApplicationDto, { company: 'Acme' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'role')).toBe(true);
  });

  it('rejects a non-canonical source', async () => {
    const dto = plainToInstance(CreateApplicationDto, {
      company: 'Acme',
      role: 'Engineer',
      source: 'facebook',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'source')).toBe(true);
  });

  it('accepts all canonical sources', async () => {
    for (const source of ['linkedin', 'indeed', 'referral', 'other']) {
      const dto = plainToInstance(CreateApplicationDto, {
        company: 'Acme',
        role: 'Engineer',
        source,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });
});

describe('UpdateStageDto', () => {
  it('accepts canonical stages', async () => {
    for (const stage of ['saved', 'applied', 'screened', 'interview', 'offer', 'rejected']) {
      const dto = plainToInstance(UpdateStageDto, { stage });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it('rejects non-canonical stage (interviewing/offers/on-hold)', async () => {
    for (const stage of ['interviewing', 'offers', 'on-hold']) {
      const dto = plainToInstance(UpdateStageDto, { stage });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'stage')).toBe(true);
    }
  });
});