/**
 * Los tipos del tablero de puntajes.
 *
 * El backend manda una sola lista ya ordenada porque las dos fuentes (las ofertas
 * del CRM y las vacantes ingeridas del feed) se puntuan con la misma regla y el
 * mismo perfil. Mezclarlas en el cliente para ordenarlas otra vez seria mantener
 * dos ordenes.
 */

export interface ScoreboardItem {
  kind: 'offer' | 'vacancy';
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string | null;
  salary: string | null;
  category: string | null;
  postedAt: string | null;
  /** Solo en ofertas del CRM: la columna del tablero en la que esta. */
  status?: string;
  /** Solo en ofertas del CRM: el fit numerico de Jev (0..3) y el veredicto de la compuerta. */
  jevFitScore?: number | null;
  jevDecision?: string | null;
  score: number;
  matchedSkills: string[];
  titleSkills: string[];
  primaryMatches: number;
  signals: string[];
  /**
   * De donde salio el texto puntuado. `index` significa que solo se leyo el
   * titulo, porque el feed no trae la descripcion del aviso. No es lo mismo que
   * un puntaje sobre el aviso completo y la vista lo dice.
   */
  scoredFrom: 'offer' | 'index' | 'description';
}

export interface ScoreboardRejection {
  kind: string;
  id: string;
  title: string;
  company: string | null;
  url: string | null;
  reason: string;
}

export interface Scoreboard {
  items: ScoreboardItem[];
  rejected: ScoreboardRejection[];
  totals: { offers: number; vacancies: number; admitted: number; rejected: number };
  meta: { profileSkills: number; weights: Record<string, number>; scoredAt: string };
}

export interface RefreshJob {
  status: 'idle' | 'running' | 'done' | 'failed';
  startedAt?: string;
  finishedAt?: string;
  pages: number;
  fetched: number;
  upserted: number;
  admitted: number;
  total: number;
  message: string;
  error?: string;
}
