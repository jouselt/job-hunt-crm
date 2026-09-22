import { readFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_TRIAGE_PROFILE } from './profile.default';

/**
 * El perfil por defecto de la app y el perfil de ejemplo del repo tienen que ser
 * el mismo perfil.
 *
 * `tools/fixtures/triage-profile.example.json` es con el que se generan las
 * reglas y el fixture dorado del scorer de Python. `profile.default.ts` es el que
 * usa la app cuando nadie configuro el suyo. Si divergen, el scorer de TypeScript
 * y el ranker de Python puntuan contra dos candidatos distintos y el fixture
 * dorado falla con decenas de casos, sin decir por que: los dos perfiles se ven
 * razonables por separado.
 *
 * Este test existe porque esa divergencia ya paso una vez, al cambiar un default
 * sin cambiar el otro.
 */
describe('DEFAULT_TRIAGE_PROFILE', () => {
  it('es identico al perfil de ejemplo que usan las herramientas de Python', () => {
    // __dirname es <repo>/backend/src/offer-triage, asi que tres niveles arriba
    // esta la raiz del repo, donde vive tools/.
    const fixturePath = join(
      __dirname,
      '..',
      '..',
      '..',
      'tools',
      'fixtures',
      'triage-profile.example.json',
    );
    const fromDisk = JSON.parse(readFileSync(fixturePath, 'utf-8'));

    expect(DEFAULT_TRIAGE_PROFILE).toEqual(fromDisk);
  });

  it('no lleva datos personales de quien lo escribio', () => {
    // Un perfil por defecto se publica: si nombra empleadores, educacion o
    // situacion migratoria, quien clone el repo hereda esa biografia.
    const serialized = JSON.stringify(DEFAULT_TRIAGE_PROFILE);

    for (const personal of ['Globant', 'Disney', 'Universidad', 'visa', 'sponsorship']) {
      expect(serialized).not.toContain(personal);
    }
  });
});
