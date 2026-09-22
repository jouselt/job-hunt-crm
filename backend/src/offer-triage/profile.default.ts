/**
 * Perfil de triage de ejemplo.
 *
 * Es el perfil que se usa cuando la persona todavia no configuro el suyo, y el
 * contexto que recibe Jev en `state.profile`. Hay un solo perfil y dos
 * consumidores: Jev lo recibe entero y responde `fit` y `hard_gate`; el scorer
 * local de `vacancies/` lee `skill_depth` para poner pesos. Si el scorer tuviera
 * su propia copia de los skills, el puntaje local y el de Jev describirian dos
 * candidatos distintos, que es justo lo que este archivo evita.
 *
 * IMPORTANTE: este objeto tiene que ser identico a
 * `tools/fixtures/triage-profile.example.json`, que es el perfil con el que se
 * generan las reglas y el fixture dorado del scorer. Un test lo verifica
 * (`profile.default.spec.ts`), porque dos copias de un perfil divergen en
 * silencio y el sintoma es que los puntajes dejan de coincidir con el ranker.
 *
 * No pongas datos personales aca. Este archivo se publica: quien clone el repo
 * heredaria tus empleadores, tu educacion y tu situacion migratoria como perfil
 * por defecto. El perfil real de cada persona se guarda en Settings, en su
 * propia fila de `user_settings`.
 */
export const DEFAULT_TRIAGE_PROFILE = {
  roles: ['Senior Fullstack Developer', 'Senior Frontend Engineer', 'Fullstack Engineer'],
  skills: [
    'Angular',
    'TypeScript',
    'NestJS',
    'Node.js',
    'RxJS',
    'NgRx',
    'PostgreSQL',
    'TypeORM',
    'Docker',
    'REST APIs',
    'Jest',
    'Git',
    'NixOS',
  ],
  seniority: 'senior',
  location: 'Remote',
  remote_ok: true,
  years_of_experience: 8,
  /**
   * Pesos del score local. Los valores son los del ranker: `primary_daily` pesa
   * mas que `production_experience`, que pesa mas que lo transferible. Los
   * nombres de las claves tienen que coincidir con `DEPTH_TO_WEIGHT`.
   */
  skill_depth: {
    primary_daily: ['Angular', 'TypeScript', 'RxJS', 'Node.js', 'NestJS'],
    production_experience: ['PostgreSQL', 'TypeORM', 'Docker', 'Jest'],
    personal_projects: ['NixOS'],
    transferable_not_primary: [
      'React (used in past roles, not the primary stack)',
      'Python (used where needed, not a primary language)',
    ],
    note: 'Example weights only. Replace with your own profile in Settings.',
  },
  disqualifiers: [
    'Roles whose primary stack is a language outside this profile, with no TypeScript or JavaScript work involved.',
  ],
  acceptable_not_disqualifying: [
    'The role is contract, freelance or fixed-term rather than permanent.',
    'The role is at a startup or a small company rather than an enterprise.',
    'The role mentions React, Vue or another framework alongside Angular.',
    'The role is in a domain the profile has not worked in before.',
  ],
  preferences: {
    remote_first: true,
    compensation_note:
      'Not stated in the profile. Do not reject an offer on compensation grounds.',
  },
};
