/**
 * Firebase web config for the live project. Not a secret: every read and write is
 * governed by database.rules.json. Emulator runs override the project with
 * `demo-frontier` in init.ts.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyB8plwuHqhDk90945_a88ABWxMW5wNzfwY',
  authDomain: 'frontier-sim.firebaseapp.com',
  databaseURL: 'https://frontier-sim-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'frontier-sim',
  storageBucket: 'frontier-sim.firebasestorage.app',
  messagingSenderId: '1097032693743',
  appId: '1:1097032693743:web:4942a88d0f189b9a5ae81a',
} as const;

/** Project ID used for every emulator run; needs no login or credentials. */
export const EMULATOR_PROJECT_ID = 'demo-frontier';
export const EMULATOR_HOST = '127.0.0.1';
export const EMULATOR_AUTH_PORT = 9099;
export const EMULATOR_DATABASE_PORT = 9000;
