/**
 * Prueba que el port a TypeScript dice exactamente lo mismo que el Python.
 *
 * El fixture no lo escribi yo: lo genera `tools/generate_scoring_golden.py` corriendo
 * las mismas entradas por `rank_live_vacancies.py`, que es la fuente de las reglas.
 * Este spec las corre por `vacancy-scoring.ts` y compara campo por campo. Sin esto,
 * el backend tendria una segunda implementacion del scoring y los dos numeros se
 * separarian sin que nada avise.
 *
 * Los casos sinteticos llevan nombre y cubren cada rama, incluidas las que
 * existieron por bugs reales: el pedido de anos en espanol, "100 Jahre" leido como
 * "00 years", el rango donde decide el piso, el cuerpo capado y el titulo que
 * decide por encima del cuerpo.
 *
 * Si este spec se pone rojo hay tres causas posibles y hay que distinguirlas:
 * el port tiene un bug (arreglar el TS), una regla cambio en el Python (regenerar
 * el fixture), o el perfil cambio (regenerar el fixture).
 */
import * as fs from 'fs';
import * as path from 'path';

import { DEFAULT_TRIAGE_PROFILE } from '../offer-triage/profile.default';
import {
  admit,
  daysOld,
  entryTokens,
  hasPrimaryStack,
  hasTitleSignal,
  keywordRegex,
  matchSkills,
  scoreVacancy,
  skillMatchesToken,
  skillWeights,
  type ScoreInput,
} from './vacancy-scoring';
import { FRESH_DAYS } from './vacancy-rules.generated';

interface GoldenCase {
  name: string;
  input: ScoreInput;
  expected: {
    score: number;
    matchedSkills: string[];
    titleSkills: string[];
    primaryMatches: number;
    signals: string[];
    disqualifiers: string[];
  };
}

interface Golden {
  today: string;
  case_count: number;
  synthetic_count: number;
  corpus_count: number;
  cases: GoldenCase[];
}

const FIXTURE = path.join(__dirname, '..', '..', 'test', 'fixtures', 'scoring-golden.json');
const golden: Golden = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const today = new Date(`${golden.today}T00:00:00Z`);
const weights = skillWeights(DEFAULT_TRIAGE_PROFILE);

describe('golden: el scorer de TypeScript reproduce el ranker de Python', () => {
  it('el fixture esta poblado con las dos clases de caso', () => {
    expect(golden.case_count).toBe(golden.cases.length);
    expect(golden.synthetic_count).toBeGreaterThan(30);
    expect(golden.corpus_count).toBeGreaterThan(0);
  });

  it('el perfil por defecto pesa los skills del daily stack', () => {
    // Si el perfil pierde `skill_depth`, todos los pesos caen al mismo valor y el
    // ranking deja de distinguir Angular de un skill transferible.
    expect(weights['Angular']).toBe(5);
    expect(weights['TypeScript']).toBe(5);
    expect(weights['NestJS']).toBe(5);
    expect(weights['React']).toBeLessThan(weights['Angular']);
  });

  it.each(golden.cases.map((testCase) => [testCase.name, testCase] as const))(
    '%s',
    (_name, testCase) => {
      const actual = scoreVacancy(testCase.input, weights, today);
      expect({
        score: actual.score,
        matchedSkills: actual.matchedSkills,
        titleSkills: actual.titleSkills,
        primaryMatches: actual.primaryMatches,
        signals: actual.signals,
        disqualifiers: actual.disqualifiers,
      }).toEqual(testCase.expected);
    },
  );
});

describe('las piezas del port que se rompen en silencio', () => {
  it('el keyword tolera el plural pero exige palabra completa', () => {
    expect(keywordRegex('websocket').test('trabajamos con websockets')).toBe(true);
    expect(keywordRegex('angular').test('angularjs es otro skill')).toBe(false);
    expect(keywordRegex('node').test('internode')).toBe(false);
  });

  it('el token de skill NO tolera el plural, para que Angular no se derrame sobre AngularJS', () => {
    // `skill_matches_token` usa limite de palabra sin el `s?` del keyword. Copiarle
    // el plural haria que el peso alto de Angular cayera sobre AngularJS.
    expect(skillMatchesToken('Angular', 'Angular 18 (Disney Parks)')).toBe(true);
    expect(skillMatchesToken('Angular', 'AngularJS (maintenance and migration)')).toBe(false);
    expect(skillMatchesToken('AngularJS', 'AngularJS (maintenance and migration)')).toBe(true);
    // La direccion inversa: el token "Node" tiene que alcanzar al skill "Node.js".
    expect(skillMatchesToken('Node.js', 'Node')).toBe(true);
  });

  it('parte las entradas de skill_depth por barra y coma, sin perder el peso', () => {
    expect(entryTokens('Angular 18 (Disney Parks)')).toEqual(['Angular 18']);
    expect(entryTokens('Stencil.js / Web Components')).toEqual(['Stencil.js', 'Web Components']);
    expect(entryTokens('React (production use 2021-2022)')).toEqual(['React']);
  });

  it('ordena por peso y desempata por nombre, igual que el ranker', () => {
    const matched = matchSkills('angular typescript react nixos', weights);
    expect(matched.slice(0, 2)).toEqual(['Angular', 'TypeScript']);
    expect(matched.indexOf('React')).toBeGreaterThan(matched.indexOf('TypeScript'));
  });

  it('lee los dias sin correrse un dia por zona horaria', () => {
    expect(daysOld('2026-09-21', today)).toBe(0);
    expect(daysOld('2026-09-20', today)).toBe(1);
    expect(daysOld('no-es-fecha', today)).toBeNull();
  });

  it('la frescura se mide en dias contra FRESH_DAYS, no en meses de calendario', () => {
    // La aritmetica de meses daba 1 ("un mes") para un aviso de 49 dias y le pagaba
    // el bonus: en produccion lo cobraban 15 de 20 avisos de julio y 47 de 47 de
    // agosto. El fixture dorado cubre los 27 casos que quedaron mal; esto fija la
    // frontera en el port.
    expect(daysOld('2026-08-22', today)).toBe(FRESH_DAYS);
    expect(daysOld('2026-08-02', today)).toBe(50);
    expect(daysOld('2026-08-22', today)! <= FRESH_DAYS).toBe(true);
    expect(daysOld('2026-08-02', today)! <= FRESH_DAYS).toBe(false);
  });

  it('la compuerta de stack diario es la que rechaza, no la del titulo', () => {
    // "Senior Embedded Linux Software Engineer" pasa la compuerta de titulo (el
    // titulo dice "engineer") y nombra Docker y Python, asi que solo cae porque
    // ninguna de esas es una skill del daily stack. Confundir las dos compuertas
    // mete una vacante de embedded en la lista de un senior fullstack.
    const embedded = scoreVacancy(
      {
        title: 'Senior Embedded Linux Software Engineer',
        description: 'Docker, Jenkins, Python. Embedded Linux, Yocto.',
      },
      weights,
      today,
    );
    expect(hasTitleSignal({ title: 'Senior Embedded Linux Software Engineer' }, weights)).toBe(true);
    expect(embedded.matchedSkills.length).toBeGreaterThan(0);
    expect(hasPrimaryStack(embedded)).toBe(false);
    expect(admit(embedded)).toEqual({ admitted: false, reason: 'no daily-stack skill is named' });

    const angular = scoreVacancy(
      { title: 'Senior Angular Developer', description: 'Angular y TypeScript.' },
      weights,
      today,
    );
    expect(admit(angular)).toEqual({ admitted: true });
  });
});

describe('los casos que costaron una postulacion real', () => {
  it('un pedido de experiencia en espanol ahora si dispara el gate', () => {
    // El feed chileno escribe en espanol. Sin las formas en espanol, el gate de
    // seniority no podia dispararse sobre ese corpus y un aviso de nivel medio
    // pasaba en silencio.
    const junior = scoreVacancy(
      { title: 'Desarrollador Fullstack', description: 'Buscamos 3 años de experiencia con Angular.' },
      weights,
      today,
    );
    expect(junior.disqualifiers.join(' ')).toContain('3 años');

    const senior = scoreVacancy(
      { title: 'Desarrollador Fullstack', description: 'Buscamos 8 años de experiencia con Angular.' },
      weights,
      today,
    );
    expect(senior.disqualifiers).toEqual([]);
  });

  it('la antiguedad de la empresa no es un pedido de experiencia', () => {
    const result = scoreVacancy(
      {
        title: 'Senior Angular Developer',
        description: 'Empresa con 100 Jahre Firmengeschichte. Angular und TypeScript.',
      },
      weights,
      today,
    );
    expect(result.disqualifiers).toEqual([]);
  });

  it('un titulo senior tolera un ano menos pero no dos', () => {
    const atThree = scoreVacancy(
      { title: 'Senior Angular Developer', description: 'Angular. 3 years of experience.' },
      weights,
      today,
    );
    const atTwo = scoreVacancy(
      { title: 'Senior Angular Developer', description: 'Angular. 2 years of experience.' },
      weights,
      today,
    );
    expect(atThree.disqualifiers).toEqual([]);
    expect(atTwo.disqualifiers.join(' ')).toContain('2 years');
  });
});
