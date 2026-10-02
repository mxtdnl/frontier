/**
 * Firebase initialisation. With `VITE_USE_EMULATOR=1` the app connects to the local
 * emulators under project `demo-frontier`, which needs no login or credentials.
 */
import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase, type Database } from 'firebase/database';
import { EMULATOR_AUTH_PORT, EMULATOR_DATABASE_PORT, EMULATOR_HOST, EMULATOR_PROJECT_ID, firebaseConfig } from './config';

export interface FirebaseHandles {
  app: FirebaseApp;
  auth: Auth;
  db: Database;
  emulator: boolean;
}

export const usesEmulator = (): boolean => import.meta.env.VITE_USE_EMULATOR === '1';

/** Options for the emulator: a demo project, so nothing can reach the live database. */
export const emulatorOptions: FirebaseOptions = {
  apiKey: 'demo-key',
  authDomain: `${EMULATOR_PROJECT_ID}.firebaseapp.com`,
  databaseURL: `https://${EMULATOR_PROJECT_ID}-default-rtdb.firebaseio.com`,
  projectId: EMULATOR_PROJECT_ID,
};

let handles: FirebaseHandles | null = null;

/** Lazily initialises Firebase once per page. */
export function getFirebase(): FirebaseHandles {
  if (handles) return handles;
  const emulator = usesEmulator();
  const app = initializeApp(emulator ? emulatorOptions : firebaseConfig);
  const auth = getAuth(app);
  const db = getDatabase(app);
  if (emulator) {
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${EMULATOR_AUTH_PORT}`, { disableWarnings: true });
    connectDatabaseEmulator(db, EMULATOR_HOST, EMULATOR_DATABASE_PORT);
  }
  handles = { app, auth, db, emulator };
  return handles;
}
