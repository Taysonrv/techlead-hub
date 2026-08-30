import {
  contextBridge,
  ipcRenderer,
} from "electron";

/* =========================================================
   TIPOS
========================================================= */

type UpdateStatus =
  | "idle"
  | "disabled"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

type UpdateState = {
  status: UpdateStatus;

  currentVersion: string;

  availableVersion:
    | string
    | null;

  percent: number;

  transferred: number;

  total: number;

  bytesPerSecond: number;

  message:
    | string
    | null;
};

type UpdateStateListener = (
  state: UpdateState
) => void;

/* =========================================================
   API SEGURA EXPOSTA AO REACT
========================================================= */

const techLeadHubApi = {
  /* =======================================================
     AMBIENTE
  ======================================================= */

  platform:
    process.platform,

  desktop:
    true,

  /* =======================================================
     VERSÃO
  ======================================================= */

  getVersion:
    async (): Promise<string> => {
      return ipcRenderer.invoke(
        "app:get-version"
      );
    },

  /* =======================================================
     ATUALIZAÇÕES
  ======================================================= */

  updates: {
    getState:
      async (): Promise<UpdateState> => {
        return ipcRenderer.invoke(
          "updater:get-state"
        );
      },

    check:
      async (): Promise<UpdateState> => {
        return ipcRenderer.invoke(
          "updater:check"
        );
      },

    download:
      async (): Promise<UpdateState> => {
        return ipcRenderer.invoke(
          "updater:download"
        );
      },

    install:
      async (): Promise<boolean> => {
        return ipcRenderer.invoke(
          "updater:install"
        );
      },

    onStateChange: (
      listener:
        UpdateStateListener
    ) => {
      /*
       * Criamos um wrapper para não
       * expor o objeto Electron Event
       * ao renderer.
       */

      const handler = (
        _event:
          Electron.IpcRendererEvent,

        state:
          UpdateState
      ) => {
        listener(state);
      };

      ipcRenderer.on(
        "updater:state",
        handler
      );

      /*
       * Retorna função de unsubscribe.
       *
       * No React:
       *
       * useEffect(() => {
       *   const unsubscribe =
       *     window.techLeadHub
       *       .updates
       *       .onStateChange(...);
       *
       *   return unsubscribe;
       * }, []);
       */

      return () => {
        ipcRenderer.removeListener(
          "updater:state",
          handler
        );
      };
    },
  },
};

/* =========================================================
   CONTEXT BRIDGE
========================================================= */

contextBridge.exposeInMainWorld(
  "techLeadHub",
  techLeadHubApi
);