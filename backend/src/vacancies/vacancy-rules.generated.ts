/**
 * GENERADO POR tools/generate_ts_scoring_rules.py. NO EDITAR A MANO.
 *
 * Las constantes salen del Python real (rank_live_vacancies.py y
 * shortlist_remote_companies.py), que es donde viven las reglas. Transcribirlas
 * a mano dejaria dos verdades y el score de la app empezaria a diferir del
 * ranker sin que nada lo avise. Para cambiar una regla se cambia el Python y se
 * regenera.
 */

export const BODY_STACK_CAP = 12.0;
export const TITLE_PRIMARY_BONUS = 7.0;
export const TITLE_OTHER_BONUS = 3.0;
export const TITLE_ROLE_BONUS = 6.0;
export const TITLE_SENIOR_BONUS = 2.0;
export const REMOTE_BONUS = 3.0;
export const SPONSORSHIP_BONUS = 2.0;
export const FRESH_BONUS = 2.0;
export const FRESH_DAYS = 30;
export const DEFAULT_YEARS_FLOOR = 4;
export const SENIOR_TITLE_YEARS_FLOOR = 3;
export const PRIMARY_WEIGHT = 5.0;
export const FRESH_MONTHS = 24;

export const TITLE_ROLE_SIGNAL: string[] = [
  "fullstack",
  "full-stack",
  "full stack",
  "frontend",
  "front-end",
  "front end",
  "angular",
  "web developer",
  "software engineer",
  "software developer",
  "web engineer",
];
export const TITLE_ANY_SIGNAL: string[] = [
  "fullstack",
  "full-stack",
  "full stack",
  "frontend",
  "front-end",
  "front end",
  "angular",
  "web developer",
  "software engineer",
  "software developer",
  "web engineer",
  "developer",
  "engineer",
  "entwickler",
  "entwicklerin",
  "programmer",
];
export const TS_JS_SIGNAL: string[] = [
  "typescript",
  "javascript",
  "angular",
  "node.js",
  "nodejs",
  "react",
  "vue",
  "nestjs",
  "rxjs",
  "js",
];
export const OUTSIDER_TITLE: string[] = [
  "java",
  "c#",
  "csharp",
  ".net",
  "dotnet",
  "php",
  "golang",
  "rust",
  "ruby",
  "scala",
  "elixir",
  "kotlin",
  "swift",
  "perl",
  "golang",
  "rails",
  "laravel",
  "django",
  "spring",
  "symfony",
];
export const MOBILE_PRIMARY: string[] = [
  "ios",
  "swift",
  "android",
  "kotlin",
  "flutter",
  "react native",
];
export const WEB_STACK_IN_TITLE: string[] = [
  "angular",
  "typescript",
  "javascript",
  "node",
  "nestjs",
  "web",
  "frontend",
  "front-end",
  "fullstack",
  "full-stack",
  "full stack",
  "react",
];
export const MANAGEMENT_TITLE: string[] = [
  "engineering manager",
  "head of engineering",
  "head of development",
  "head of technology",
  "director of engineering",
  "engineering director",
  "team lead",
  "teamlead",
  "delivery manager",
  "cto",
];
export const BELOW_SENIOR_TITLE: string[] = [
  "junior",
  "jr",
  "trainee",
  "intern",
  "internship",
  "praktikum",
  "praktikant",
  "werkstudent",
  "working student",
  "student assistant",
  "dual student",
  "hilfskraft",
  "abschlussarbeit",
  "thesis student",
  "ausbildung",
  "berufseinsteiger",
  "einsteiger",
  "entry level",
  "entry-level",
  "graduate",
  "absolvent",
  "mid-level",
  "midlevel",
  "medior",
];
export const SENIOR_TITLE: string[] = [
  "senior",
  "sr",
  "lead",
  "principal",
  "staff",
];
export const NO_SPONSORSHIP: string[] = [
  "no sponsorship",
  "no visa sponsorship",
  "no visa support",
  "not able to sponsor",
  "not able to offer sponsorship",
  "cannot sponsor",
  "can not sponsor",
  "unable to sponsor",
  "without sponsorship",
  "sponsorship is not available",
  "does not offer sponsorship",
  "kein visum",
  "keine visum",
  "visum wird nicht",
  "aufenthaltstitel erforderlich",
  "arbeitserlaubnis erforderlich",
  "existing work authorization",
  "existing work authorisation",
  "already have the right to work",
  "must be authorized to work",
  "must be authorised to work",
  "must already be eligible to work",
  "right to work in the eu",
  "eu work permit",
  "must be an eu citizen",
  "eu citizens only",
];
export const RESIDENCY_OR_CLEARANCE: string[] = [
  "security clearance",
  "sicherheitsuberprufung",
  "sicherheitsueberpruefung",
  "must be a resident",
  "must reside",
  "must be based in",
  "must be located in",
  "only candidates based in",
  "only considering candidates based in",
  "you must live in",
  "residents only",
  "already resident",
];
export const ONSITE_PRESENCE: string[] = [
  "on-site",
  "onsite",
  "on site",
  "vor ort",
  "prasenz",
  "praesenz",
  "office-based",
  "office based",
  "in-office",
  "hybrid",
];
export const RELOCATION_OFFERED: string[] = [
  "relocation",
  "relocation package",
  "relocation support",
  "umzug",
  "visa sponsorship",
  "sponsorship available",
  "we sponsor",
  "we do sponsor",
];
export const REMOTE_SIGNAL: string[] = [
  "remote",
  "fully remote",
  "100% remote",
  "home office",
  "homeoffice",
  "work from anywhere",
  "anywhere in the world",
  "remote-first",
];
export const YEARS_SOFT_CUES: string[] = [
  "plus",
  "nice to have",
  "nice-to-have",
  "ideal",
  "preferred",
  "bonus",
  "von vorteil",
  "wunschenswert",
  "w\u00fcnschenswert",
  "optional",
];
export const OTHER_STACK_LANGUAGES: string[] = [
  "java",
  "c#",
  "csharp",
  ".net",
  "dotnet",
  "php",
  "golang",
  "go",
  "rust",
  "ruby",
  "scala",
  "elixir",
  "kotlin",
  "swift",
  "perl",
];

export const SKILL_KEYWORDS: Record<string, string[]> = {
  "Angular": [
  "angular",
],
  "AngularJS": [
  "angularjs",
  "angular.js",
],
  "TypeScript": [
  "typescript",
],
  "NestJS": [
  "nestjs",
  "nest.js",
],
  "Node.js": [
  "node.js",
  "nodejs",
],
  "RxJS": [
  "rxjs",
],
  "NgRx": [
  "ngrx",
],
  "Stencil.js": [
  "stencil",
],
  "Web Components": [
  "web component",
],
  "Microfrontends": [
  "microfrontend",
  "micro-frontend",
],
  "single-spa": [
  "single-spa",
],
  "PrimeNG": [
  "primeng",
],
  "Angular Material": [
  "angular material",
],
  "REST APIs": [
  "rest api",
  "restful",
],
  "BFF architecture": [
  "bff",
],
  "WebSockets": [
  "websocket",
],
  "PostgreSQL": [
  "postgres",
  "postgresql",
],
  "TypeORM": [
  "typeorm",
],
  "Docker": [
  "docker",
],
  "Jest": [
  "jest",
],
  "Karma": [
  "karma",
],
  "Jasmine": [
  "jasmine",
],
  "AWS": [
  "aws",
  "amazon web services",
],
  "Ionic": [
  "ionic",
],
  "Jenkins": [
  "jenkins",
],
  "GitLab CI/CD": [
  "gitlab",
],
  "Azure DevOps": [
  "azure devops",
],
  "Splunk": [
  "splunk",
],
  "Accessibility (a11y)": [
  "accessibility",
  "a11y",
],
  "i18n": [
  "i18n",
  "internationalization",
],
  "React": [
  "react",
],
  ".NET backend API integration": [
  ".net",
  "dotnet",
],
  "Python": [
  "python",
],
};

export const DEPTH_TO_WEIGHT: [string, number][] = [
  ["primary_daily", 5.0],
  ["production_experience", 3.0],
  ["personal_projects", 1.0],
  ["transferable_not_primary", 1.0],
];

export const STACK_WEIGHT: Record<string, number> = {
  "primary_daily": 5.0,
  "production": 3.0,
  "transferable": 1.0,
  "personal": 1.0,
};

/** `EXPERIENCE_RE` del ranker, con el lookbehind que evita leer '100 Jahre' como '00'. */
export const EXPERIENCE_PATTERN = "(?<!\\d)(\\d{1,2})\\s*(?:\\+|(?:-|\\s+to\\s+)\\s*(\\d{1,2}))?\\s*(?:jahre|years|anos|a\u00f1os)\\b";
export const EXPERIENCE_FLAGS = "gi";

/** Patron de `keyword_regex`: palabra completa, tolerando el plural final. */
export const KEYWORD_TEMPLATE = '(?<![\\w]){keyword}s?(?![\\w])';
