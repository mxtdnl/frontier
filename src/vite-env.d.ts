/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" connects to the local Firebase emulators (project demo-frontier). */
  readonly VITE_USE_EMULATOR?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
