import { BadRequestException } from '@nestjs/common';
import { STAGES, ACTIVE_STAGE_ORDER, type Stage } from './stage.constants';

const ORDER_INDEX: Record<string, number> = Object.fromEntries(
  ACTIVE_STAGE_ORDER.map((s, i) => [s, i]),
);

export function promoteStage(current: string, target: string): Stage {
  if (target === STAGES.REJECTED) {
    if (current === STAGES.REJECTED) {
      throw new BadRequestException('rejected is terminal');
    }
    return STAGES.REJECTED;
  }
  if (current === STAGES.REJECTED) {
    throw new BadRequestException('rejected is terminal');
  }
  const cur = ORDER_INDEX[current];
  const nxt = ORDER_INDEX[target];
  if (cur === undefined || nxt === undefined) {
    throw new BadRequestException(`cannot move ${current} -> ${target}`);
  }
  if (nxt === cur + 1) return target as Stage;
  throw new BadRequestException(`cannot move ${current} -> ${target}`);
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function computeFollowUp(
  stage: string,
  existingFollowUp: string | null | undefined,
  today: string = toDateOnly(new Date()),
): string | null {
  if (stage === STAGES.REJECTED) return null;
  if (existingFollowUp && existingFollowUp > today) return existingFollowUp;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return toDateOnly(d);
}
