/**
 * Exporta el perfil de triage por defecto a JSON.
 *
 * Existe para que la herramienta que genera el fixture dorado del scoring pueda
 * correr el Python contra el MISMO perfil que usa el backend. Si el generador
 * llevara su propia copia del perfil, el test compararia dos candidatos distintos
 * y pasaria igual.
 *
 *   npx ts-node --transpile-only scripts/export-profile.ts > /tmp/app-profile.json
 */
import { DEFAULT_TRIAGE_PROFILE } from '../src/offer-triage/profile.default';

process.stdout.write(JSON.stringify(DEFAULT_TRIAGE_PROFILE, null, 2) + '\n');
