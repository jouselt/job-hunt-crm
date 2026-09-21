/**
 * Perfil de triage por defecto.
 *
 * Hay un solo perfil y dos consumidores. Jev lo recibe entero como contexto
 * (`state.profile`) y responde `fit` y `hard_gate`; el scorer local de
 * `vacancies/` lee `skill_depth` para poner pesos. Si el scorer tuviera su propia
 * copia de los skills, el puntaje local y el de Jev describirian dos candidatos
 * distintos, que es justo lo que este archivo evita.
 *
 * `skill_depth` es lo que hace posible el score local: sin el, todos los skills
 * pesarian igual y "Angular" no valdria mas que "Splunk". `disqualifiers` y
 * `acceptable_not_disqualifying` son prosa para Jev; las reglas duras que aplica
 * el scorer viven en `vacancies/vacancy-rules.generated.ts`, generadas desde el
 * ranker, no aca.
 */
export const DEFAULT_TRIAGE_PROFILE = {
  roles: [
    'Senior Frontend Engineer',
    'Frontend Engineer',
    'Fullstack Engineer',
    'Senior Fullstack Engineer',
    'Senior Fullstack Developer',
    'Senior Angular Developer',
  ],
  skills: [
    'Angular',
    'AngularJS',
    'TypeScript',
    'NestJS',
    'Node.js',
    'RxJS',
    'NgRx',
    'Stencil.js',
    'Web Components',
    'Microfrontends',
    'single-spa',
    'PrimeNG',
    'Angular Material',
    'REST APIs',
    'BFF architecture',
    'WebSockets',
    'PostgreSQL',
    'TypeORM',
    'Docker',
    'Linux',
    'NixOS',
    'Jasmine',
    'Karma',
    'Jest',
    'Git',
    'Jenkins',
    'GitLab CI/CD',
    'Azure DevOps',
    'Splunk',
    'AWS',
    'Ionic',
    'Accessibility (a11y)',
    'i18n',
  ],
  seniority: 'senior',
  location: 'Remote / Santiago, Chile',
  remote_ok: true,
  relocation: 'Northern Europe or Australia/NZ considered, with a relocation package',
  notes:
    'Strong Angular/NestJS fullstack profile. Prefer remote or hybrid. Comfortable with TypeScript services and Python where needed. Values honest CV representation: titles are stated as they are, senior individual contributor with technical sign-off and mentoring, not a people manager. Angular range 2-20 describes career coverage; React is transferable, not primary.',
  years_of_experience: 10,
  current_role: {
    company: 'Globant',
    title: 'Senior Fullstack Developer',
    since: '2021-12',
    client: 'Disney Parks (WDW)',
    client_since: '2024-04',
    note: 'One employer since Dec 2021. Earlier client assignments at Globant: Carnival Cruise Line, LATAM Airlines, Disney Cruise Line, Autodesk.',
  },
  languages: {
    spanish: 'Native (C2)',
    english: 'C1 professional working proficiency',
  },
  education: {
    institution: 'Universidad Simon Bolivar, Caracas, Venezuela',
    program: 'Computer Engineering',
    studies: '2009 to 2014',
    degree_completed: false,
    note: 'Studies not completed. Foundations in algorithms, software architecture and computational thinking, plus 10 years of equivalent professional experience since.',
  },
  work_permit:
    'Non-EU/EFTA citizen based in Chile. Requires employer sponsorship for EU/DACH/Swiss roles. Chilean naturalization in process. Open to roles that include visa sponsorship and relocation support.',
  availability:
    'Remote or hybrid from Chile today. Available for relocation with a relocation package.',
  /**
   * Pesos del score local. Los valores son los del ranker: `primary_daily` pesa
   * mas que `production_experience`, que pesa mas que lo transferible. Los
   * nombres de las claves tienen que coincidir con `DEPTH_TO_WEIGHT`.
   */
  skill_depth: {
    primary_daily: ['Angular', 'TypeScript', 'RxJS', 'Node.js', 'NestJS'],
    production_experience: [
      'Angular 18 (Disney Parks)',
      'Stencil.js / Web Components',
      'AngularJS (maintenance and migration)',
      'PrimeNG',
      'Angular Material',
      'PostgreSQL',
      'TypeORM',
      'Docker',
      'Splunk',
      'Jasmine',
      'Karma',
      'Ionic',
    ],
    personal_projects: ['Angular 20', 'NixOS', 'Linux', 'self-hosted infrastructure'],
    transferable_not_primary: [
      'React (production use 2021-2022 on Autodesk Fusion 360 Web, but not the main stack)',
      '.NET backend API integration (collaborated on contract design, did not write .NET services)',
      'Python (used where needed, not a primary language)',
    ],
    note: 'Angular range 2-20 describes career coverage. Disney Parks production runs Angular 18. React is transferable, not primary.',
  },
  disqualifiers: [
    'Seniority clearly below senior level (junior, trainee, intern, or mid-level roles requiring under about 4 years of experience).',
    'Roles that require physical presence on-site in a country other than Chile with no relocation package or visa sponsorship offered.',
    'Roles that require existing EU/EFTA work authorization or that explicitly state no sponsorship is available.',
    'Pure people-management roles (engineering manager, team lead with direct reports, head of department) as the primary function, with little or no hands-on coding.',
    'Roles where native mobile development (iOS/Swift, Android/Kotlin) is the primary stack.',
    'Roles where the primary stack is a programming language outside the profile and no TypeScript or JavaScript work is involved (for example pure Java, C#/.NET, Go, Rust or PHP backend positions).',
    'Roles requiring security clearance, or roles restricted to candidates already resident in the country.',
  ],
  acceptable_not_disqualifying: [
    'The role is written in Spanish, English or German. Language is not a blocker; English is C1 and Spanish is native.',
    'The role is contract, freelance or fixed-term rather than permanent.',
    'The role is at a startup or a small company rather than an enterprise.',
    'The role mixes frontend and backend, or leans more backend than the profile usual split, as long as Node.js/TypeScript or NestJS is involved.',
    'The role mentions React, Vue or another framework alongside Angular. React is transferable.',
    'The role is fully remote and open to candidates in Latin America, or remote within a European time zone.',
    'The role requires relocation but offers a relocation package or visa sponsorship. That is explicitly welcome.',
    'The role is in a domain the profile has not worked in before (fintech, health, gaming, and similar). Domain is not a blocker.',
    'The role asks for a completed degree. The profile does not have one and states that honestly; this alone should not be treated as a hard rejection.',
  ],
  preferences: {
    remote_first: true,
    timezone: 'UTC-4, overlaps comfortably with US Eastern and partially with European mornings',
    target_markets: [
      'Remote-first international companies',
      'DACH / Northern Europe',
      'Nordics',
      'Australia / NZ',
    ],
    compensation_note: 'Not stated in the profile. Do not reject an offer on compensation grounds.',
  },
};
