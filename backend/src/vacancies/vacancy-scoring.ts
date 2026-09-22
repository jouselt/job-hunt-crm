/**
 * Puntaje local de una vacante contra el perfil, sin salir a la red.
 *
 * Es el port de `rank_live_vacancies.py`. Existe porque el score de Jev cuesta
 * una llamada por oferta y solo cubre lo que ya paso por triage, mientras que
 * una vacante ingerida del feed no tiene score hasta que alguien la mire. Con
 * esto toda vacante tiene un puntaje reproducible y gratis, y se puede recalcular
 * el universo entero cuando el perfil cambia.
 *
 * Las constantes NO estan escritas aca: viven en `vacancy-rules.generated.ts`,
 * generado desde el Python real. La logica si esta portada a mano, asi que hay
 * un test que corre las mismas entradas por el Python y por este modulo y exige
 * que los puntajes coincidan. Si los dos se separan, ese test se pone rojo.
 *
 * Dos detalles del port que no son cosmeticos:
 *
 *  - El Python busca con el texto YA en minusculas y sin flag `i`. Los patrones
 *    se construyen igual aca: agregar `i` haria que un keyword con mayuscula
 *    matchee donde el ranker no matchea.
 *  - `skillMatchesToken` usa limite de palabra SIN el `s?` del plural, a
 *    diferencia de la busqueda de keywords. Copiar el `s?` ahi haria que el
 *    peso alto de "Angular" se derrame sobre "AngularJS", que tiene su propio
 *    peso menor.
 */
import {
  BELOW_SENIOR_TITLE,
  BODY_STACK_CAP,
  DEFAULT_YEARS_FLOOR,
  DEPTH_TO_WEIGHT,
  EXPERIENCE_FLAGS,
  EXPERIENCE_PATTERN,
  FRESH_BONUS,
  FRESH_DAYS,
  MANAGEMENT_TITLE,
  MOBILE_PRIMARY,
  NO_SPONSORSHIP,
  ONSITE_PRESENCE,
  OTHER_STACK_LANGUAGES,
  OUTSIDER_TITLE,
  PRIMARY_WEIGHT,
  RELOCATION_OFFERED,
  REMOTE_BONUS,
  REMOTE_SIGNAL,
  RESIDENCY_OR_CLEARANCE,
  SENIOR_TITLE,
  SENIOR_TITLE_YEARS_FLOOR,
  SKILL_KEYWORDS,
  SPONSORSHIP_BONUS,
  STACK_WEIGHT,
  TITLE_ANY_SIGNAL,
  TITLE_OTHER_BONUS,
  TITLE_PRIMARY_BONUS,
  TITLE_ROLE_BONUS,
  TITLE_ROLE_SIGNAL,
  TITLE_SENIOR_BONUS,
  TS_JS_SIGNAL,
  WEB_STACK_IN_TITLE,
  YEARS_SOFT_CUES,
} from './vacancy-rules.generated';

/** Lo minimo que el scorer necesita de una vacante. */
export interface ScoreInput {
  title: string;
  company?: string | null;
  location?: string | null;
  description?: string | null;
  /** Fecha de publicacion, `YYYY-MM-DD`. */
  date?: string | null;
}

export interface ScoreResult {
  score: number;
  matchedSkills: string[];
  titleSkills: string[];
  /** Cuantos skills del daily stack aparecen. Es el desempate del ranking. */
  primaryMatches: number;
  signals: string[];
  /** Frases del perfil que descalifican la vacante. Vacio = pasa el gate. */
  disqualifiers: string[];
}

const regexCache = new Map<string, RegExp>();

/**
 * Escapa como lo hace `re.escape` de Python: TODO caracter no alfanumerico.
 *
 * Escapar solo los metacaracteres de JavaScript daria el mismo resultado para
 * los keywords actuales, pero dejaria de ser equivalente en cuanto alguien
 * agregue uno con `+`, `{` o `|` al perfil.
 */
function escapeRegex(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, '\\$&');
}

/**
 * Keyword con limite de palabra, tolerando el plural final.
 *
 * Cacheado: son 33 skills por cientos de keywords y se llama por cada vacante.
 * Los patrones no llevan flag `g`, asi que `.test()` no arrastra estado.
 */
export function keywordRegex(keyword: string): RegExp {
  let cached = regexCache.get(keyword);
  if (!cached) {
    cached = new RegExp('(?<![\\w])' + escapeRegex(keyword) + 's?(?![\\w])');
    regexCache.set(keyword, cached);
  }
  return cached;
}

/** Limite de palabra estricto, sin el `s?`: es el que usa `skill_matches_token`. */
function wordBounded(needle: string, haystack: string): boolean {
  return new RegExp('(?<![\\w])' + escapeRegex(needle) + '(?![\\w])').test(haystack);
}

/** Cuales de los patrones aparecen, con limite de palabra. */
export function hits(patterns: string[], text: string): string[] {
  return patterns.filter((pattern) => keywordRegex(pattern).test(text));
}

/**
 * Parte una entrada de `skill_depth` en tokens comparables.
 *
 * Las entradas son texto escrito a mano: "Angular 18 (Acme)",
 * "Stencil.js / Web Components", "React (production use 2021-2022)". Cortar por
 * "/" y "," evita que una entrada con dos skills pierda su peso.
 */
export function entryTokens(entry: string): string[] {
  const base = entry.split(/\s*\(/)[0];
  return base
    .split(/[/,]/)
    .map((token) => token.trim())
    .filter(Boolean);
}

/** Un token denota este skill por palabra completa, nunca por subcadena. */
export function skillMatchesToken(skill: string, token: string): boolean {
  const skillLower = skill.toLowerCase();
  const tokenLower = token.toLowerCase();
  return wordBounded(skillLower, tokenLower) || wordBounded(tokenLower, skillLower);
}

/**
 * Peso de cada skill, tomado del `skill_depth` del propio perfil.
 *
 * Lo que el `skill_depth` no clasifique pero este en `skills` igual cuenta, con
 * el peso transferible, para que el ranking nunca descarte en silencio un skill
 * que el perfil declara.
 */
export function skillWeights(profile: any): Record<string, number> {
  const depth = profile?.skill_depth ?? {};
  const weights: Record<string, number> = {};
  const allSkills = Object.keys(SKILL_KEYWORDS);

  for (const [depthKey, weight] of DEPTH_TO_WEIGHT) {
    for (const rawEntry of depth[depthKey] ?? []) {
      for (const token of entryTokens(String(rawEntry))) {
        for (const skill of allSkills) {
          if (skillMatchesToken(skill, token)) {
            weights[skill] = Math.max(weights[skill] ?? 0, weight);
          }
        }
      }
    }
  }

  for (const skill of profile?.skills ?? []) {
    if (SKILL_KEYWORDS[skill] && weights[skill] === undefined) {
      weights[skill] = STACK_WEIGHT['transferable'];
    }
  }

  return weights;
}

/** El texto donde busca el ranker: titulo, empresa, ubicacion y descripcion. */
export function scoreText(input: ScoreInput): string {
  return [input.title, input.company, input.location, input.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Orden del ranker: peso descendente y, a igual peso, nombre por codepoint. */
function byWeightThenName(a: string, b: string, weights: Record<string, number>): number {
  if (weights[b] !== weights[a]) return weights[b] - weights[a];
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Skills del perfil nombrados en el texto. */
export function matchSkills(text: string, weights: Record<string, number>): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const [skill, weight] of Object.entries(weights)) {
    if (weight <= 0) continue;
    const keywords = SKILL_KEYWORDS[skill] ?? [];
    if (keywords.some((keyword) => keywordRegex(keyword).test(text))) found.push(skill);
  }
  return found.sort((a, b) => byWeightThenName(a, b, weights));
}

/** Skills del perfil nombrados en el TITULO, que es donde la vacante se compromete. */
export function titleSkills(title: string, weights: Record<string, number>): string[] {
  const lower = (title ?? '').toLowerCase();
  const found = Object.keys(weights).filter((skill) =>
    (SKILL_KEYWORDS[skill] ?? []).some((keyword) => keywordRegex(keyword).test(lower)),
  );
  return found.sort((a, b) => byWeightThenName(a, b, weights));
}

/**
 * Los descalificadores del perfil, cada uno devolviendo la frase que lo disparo.
 *
 * Devuelve evidencia en vez de un booleano a proposito: un gate que nadie puede
 * auditar es un gate en el que nadie confia, y un rechazo falso aca cuesta una
 * postulacion real. El orden de los chequeos es el del ranker.
 */
export function disqualifiers(input: ScoreInput): string[] {
  const reasons: string[] = [];
  const title = (input.title ?? '').toLowerCase();
  const text = scoreText(input);

  // El cuerpo se juzga con lenidad (una mencion de TS/JS lo limpia), el titulo
  // con estrictez: ".NET Full-stack Developer" no es el trabajo de este perfil
  // aunque su cuerpo nombre TypeScript.
  const titleOutsiders = [...new Set(OUTSIDER_TITLE.filter((t) => keywordRegex(t).test(title)))].sort();
  if (titleOutsiders.length > 0 && hits(TS_JS_SIGNAL, title).length === 0) {
    reasons.push(`title names a stack outside the profile: ${titleOutsiders.join(', ')}`);
  }

  const outsiders = [...new Set(OTHER_STACK_LANGUAGES.filter((t) => keywordRegex(t).test(text)))].sort();
  if (outsiders.length > 0 && hits(TS_JS_SIGNAL, text).length === 0) {
    reasons.push(`stack outside the profile with no TS/JS: ${outsiders.join(', ')}`);
  }

  const mobile = hits(MOBILE_PRIMARY, title);
  if (mobile.length > 0 && hits(WEB_STACK_IN_TITLE, title).length === 0) {
    reasons.push(`native mobile primary in the title: ${mobile.join(', ')}`);
  }

  const management = hits(MANAGEMENT_TITLE, title);
  if (management.length > 0 && hits(WEB_STACK_IN_TITLE, title).length === 0) {
    reasons.push(`people management as the primary function: ${management.join(', ')}`);
  }

  // Antiguedad: primero las palabras del titulo, despues los anos pedidos.
  const seniorTitled = hits(SENIOR_TITLE, title).length > 0;
  if (!seniorTitled) {
    const below = hits(BELOW_SENIOR_TITLE, title);
    if (below.length > 0) reasons.push(`below senior in the title: ${below.join(', ')}`);
  }

  // El pedido de anos habla incluso bajo un titulo senior, con un ano de margen.
  const floor = seniorTitled ? SENIOR_TITLE_YEARS_FLOOR : DEFAULT_YEARS_FLOOR;
  const experience = new RegExp(EXPERIENCE_PATTERN, EXPERIENCE_FLAGS);
  for (const match of text.matchAll(experience)) {
    const start = match.index ?? 0;
    const window = text.slice(Math.max(0, start - 60), start);
    if (YEARS_SOFT_CUES.some((cue) => window.includes(cue))) continue;
    const numbers = match
      .slice(1)
      .filter((group): group is string => group !== undefined)
      .map(Number);
    if (numbers.length > 0 && Math.min(...numbers) < floor) {
      reasons.push(`asks ${match[0].trim()} of experience`);
      break;
    }
  }

  const noSponsor = hits(NO_SPONSORSHIP, text);
  if (noSponsor.length > 0) {
    reasons.push(`no sponsorship offered: ${noSponsor.slice(0, 3).join(', ')}`);
  }

  const restricted = hits(RESIDENCY_OR_CLEARANCE, text);
  if (restricted.length > 0) {
    reasons.push(`residency or clearance restriction: ${restricted.slice(0, 3).join(', ')}`);
  }

  // Presencia en otro pais sin relocation y sin via de visa: solo dispara si se
  // cumplen las tres, o sea que pide presencia, no ofrece remoto y no menciona
  // relocation.
  const presence = hits(ONSITE_PRESENCE, text);
  if (
    presence.length > 0 &&
    hits(REMOTE_SIGNAL, text).length === 0 &&
    hits(RELOCATION_OFFERED, text).length === 0
  ) {
    reasons.push(`on-site presence in another country with no relocation: ${presence[0]}`);
  }

  return reasons;
}

/** Dias transcurridos desde una fecha `YYYY-MM-DD`, o null si no se puede leer. */
export function daysOld(value: string | null | undefined, today: Date): number | null {
  if (!value) return null;
  const posted = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(posted)) return null;
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((start - posted) / 86_400_000);
}

/**
 * El puntaje, mas las piezas que lo explican.
 *
 * El cuerpo corrobora y el titulo decide: el stack del cuerpo se capa para que
 * un aviso que lista quince tecnologias no le gane a uno que ES el trabajo.
 */
export function scoreVacancy(
  input: ScoreInput,
  weights: Record<string, number>,
  today: Date,
): ScoreResult {
  const text = scoreText(input);
  const title = (input.title ?? '').toLowerCase();
  const matched = matchSkills(text, weights);
  const inTitle = titleSkills(title, weights);
  const titleSet = new Set(inTitle);

  const bodyStack = matched
    .filter((skill) => !titleSet.has(skill))
    .reduce((total, skill) => total + weights[skill], 0);
  let score = Math.min(bodyStack, BODY_STACK_CAP);

  for (const skill of inTitle) {
    score += weights[skill] >= PRIMARY_WEIGHT ? TITLE_PRIMARY_BONUS : TITLE_OTHER_BONUS;
  }

  const signals: string[] = [];
  if (hits(TITLE_ROLE_SIGNAL, title).length > 0) {
    score += TITLE_ROLE_BONUS;
    signals.push('role in title');
  }
  if (hits(SENIOR_TITLE, title).length > 0) {
    score += TITLE_SENIOR_BONUS;
    signals.push('senior in title');
  }
  if (hits(REMOTE_SIGNAL, text).length > 0) {
    score += REMOTE_BONUS;
    signals.push('remote');
  }
  if (hits(RELOCATION_OFFERED, text).length > 0) {
    score += SPONSORSHIP_BONUS;
    signals.push('relocation or sponsorship offered');
  }
  const days = daysOld(input.date, today);
  if (days !== null && days <= FRESH_DAYS) {
    score += FRESH_BONUS;
    signals.push('posted recently');
  }

  return {
    // Sin redondear: el Python devuelve el float crudo y el ranker recien formatea
    // al renderizar. Redondear aca haria que los dos lados difieran en el ultimo
    // decimal y que el test dorado del port no pudiera comparar exacto.
    score,
    matchedSkills: matched,
    titleSkills: inTitle,
    primaryMatches: matched.filter((skill) => weights[skill] >= PRIMARY_WEIGHT).length,
    signals,
    disqualifiers: disqualifiers(input),
  };
}

/** El perfil declara los skills que el titulo tiene que nombrar para ser candidata. */
export function hasTitleSignal(input: ScoreInput, weights: Record<string, number>): boolean {
  const title = (input.title ?? '').toLowerCase();
  if (titleSkills(title, weights).length > 0) return true;
  return hits(TITLE_ANY_SIGNAL, title).length > 0;
}

/**
 * La compuerta del stack diario: al menos una skill `primary_daily`.
 *
 * Es la que de verdad decide, y es distinta de la del titulo. "Senior Embedded
 * Linux Software Engineer" pasa la compuerta de titulo (el titulo dice "engineer")
 * y la de stack general (nombra Docker y Python), y solo cae aca, porque ninguna
 * de esas es una skill que el perfil use a diario. Sin esta compuerta la vacante
 * entra a la lista de un senior fullstack.
 */
export function hasPrimaryStack(result: ScoreResult): boolean {
  return result.primaryMatches > 0;
}

/**
 * Si la vacante merece estar en la lista, con el motivo cuando no.
 *
 * Un rechazo sin motivo es un rechazo que nadie puede auditar, asi que devuelve
 * la razon en vez de un booleano.
 */
export function admit(result: ScoreResult): { admitted: boolean; reason?: string } {
  if (result.disqualifiers.length > 0) {
    return { admitted: false, reason: result.disqualifiers[0] };
  }
  if (result.matchedSkills.length === 0) {
    return { admitted: false, reason: 'no skill from the profile is named' };
  }
  if (!hasPrimaryStack(result)) {
    return { admitted: false, reason: 'no daily-stack skill is named' };
  }
  return { admitted: true };
}
