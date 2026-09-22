import { BadRequestException } from '@nestjs/common';
import { promoteStage, computeFollowUp } from './stage.transitions';

describe('promoteStage', () => {
  it('promotes saved -> applied: guardar y despues postular es un paso', () => {
    // Si `saved` no estuviera en el orden, mover la tarjeta fallaba con
    // "cannot move saved -> applied" y el usuario no podia avanzar su pipeline.
    expect(promoteStage('saved', 'applied')).toBe('applied');
  });

  it('rejects skipping from saved straight to screened', () => {
    expect(() => promoteStage('saved', 'screened')).toThrow(BadRequestException);
  });

  it('promotes in forward order applied -> screened -> interview -> offer', () => {
    expect(promoteStage('applied', 'screened')).toBe('screened');
    expect(promoteStage('screened', 'interview')).toBe('interview');
    expect(promoteStage('interview', 'offer')).toBe('offer');
  });

  it('rejects skipping a stage', () => {
    expect(() => promoteStage('applied', 'offer')).toThrow(BadRequestException);
    expect(() => promoteStage('applied', 'interview')).toThrow(BadRequestException);
  });

  it('rejects backward moves', () => {
    expect(() => promoteStage('interview', 'screened')).toThrow(BadRequestException);
    expect(() => promoteStage('offer', 'applied')).toThrow(BadRequestException);
  });

  it('allows rejection from any active stage', () => {
    expect(promoteStage('applied', 'rejected')).toBe('rejected');
    expect(promoteStage('interview', 'rejected')).toBe('rejected');
    expect(promoteStage('offer', 'rejected')).toBe('rejected');
  });

  it('rejects moving out of rejected (terminal)', () => {
    expect(() => promoteStage('rejected', 'applied')).toThrow(BadRequestException);
    expect(() => promoteStage('rejected', 'rejected')).toThrow(BadRequestException);
  });

  it('rejects non-canonical stage values', () => {
    expect(() => promoteStage('applied', 'interviewing')).toThrow(BadRequestException);
    expect(() => promoteStage('on-hold', 'applied')).toThrow(BadRequestException);
  });
});

describe('computeFollowUp', () => {
  it('returns null for rejected stage', () => {
    expect(computeFollowUp('rejected', null, '2026-01-01')).toBeNull();
  });

  it('preserves an explicit future follow-up date', () => {
    expect(computeFollowUp('screened', '2026-02-01', '2026-01-01')).toBe('2026-02-01');
  });

  it('sets +7 days when no follow-up exists', () => {
    expect(computeFollowUp('screened', null, '2026-01-01')).toBe('2026-01-08');
  });

  it('replaces a past follow-up with +7 days', () => {
    // existing follow-up in the past should not be preserved
    expect(computeFollowUp('screened', '2025-12-25', '2026-01-01')).toBe('2026-01-08');
  });
});