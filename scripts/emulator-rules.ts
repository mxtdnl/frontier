/**
 * Loads database.rules.json into the running database emulator for the namespace the
 * app uses (`demo-frontier-default-rtdb`). The Firebase CLI cannot do this in the cloud
 * container: it sends even local requests through the outbound proxy, which refuses them.
 *
 * Usage: `npm run emulators` in one shell, then `npm run emulators:rules`.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { EMULATOR_DATABASE_PORT, EMULATOR_HOST, EMULATOR_PROJECT_ID } from '../src/firebase/config';

/** The namespace the web SDK derives from the emulator databaseURL in src/firebase/init.ts. */
export const APP_NAMESPACE = `${EMULATOR_PROJECT_ID}-default-rtdb`;

function emulatorUrl(path: string, ns: string): string {
  const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST ?? `${EMULATOR_HOST}:${EMULATOR_DATABASE_PORT}`;
  return `http://${host}/${path}?ns=${encodeURIComponent(ns)}`;
}

async function owner(method: 'PUT' | 'PATCH', path: string, body: string, ns: string): Promise<void> {
  const resp = await fetch(emulatorUrl(path, ns), { method, headers: { Authorization: 'Bearer owner' }, body });
  if (!resp.ok) throw new Error(`Emulator ${method} ${path} failed: ${resp.status} ${await resp.text()}`);
}

export const loadRules = (ns = APP_NAMESPACE, file = 'database.rules.json'): Promise<void> =>
  owner('PUT', '.settings/rules.json', readFileSync(file, 'utf8'), ns);

/** Writes with admin rights, bypassing rules (emulator only). */
export const adminSet = (path: string, value: unknown, ns = APP_NAMESPACE): Promise<void> =>
  owner('PUT', `${path}.json`, JSON.stringify(value), ns);

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  loadRules()
    .then(() => console.log(`Loaded database.rules.json into emulator namespace ${APP_NAMESPACE}.`))
    .catch((e: unknown) => {
      console.error(e instanceof Error ? e.message : e);
      console.error('Start the emulators first with `npm run emulators`.');
      process.exit(1);
    });
}
