/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    readonly VITE_PRIVY_APP_ID: string;
  }

  interface Window {
    __privyAnalyticsFetchPatched?: boolean;
  }
}

export {};
