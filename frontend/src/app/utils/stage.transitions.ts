import { Stage } from '../models/application.model';

const FORWARD_ORDER: Stage[] = ['saved', 'applied', 'screened', 'interview', 'offer'];

/** Returns the next forward stage, or null if already at terminal "offer". */
export function nextStage(current: Stage): Stage | null {
  const idx = FORWARD_ORDER.indexOf(current);
  return idx >= 0 && idx < FORWARD_ORDER.length - 1
    ? FORWARD_ORDER[idx + 1]
    : null;
}

/** The canonical stage columns for the Kanban (rejected never a column). */
export const KANBAN_COLUMNS: Stage[] = FORWARD_ORDER;