/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HISTORY_JSON_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
