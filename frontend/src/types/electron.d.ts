export {};

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

declare global {
  interface Window {
    techLeadHub?: {
      platform: string;

      desktop: boolean;

      getVersion: () =>
        Promise<string>;

      updates: {
        getState: () =>
          Promise<UpdateState>;

        check: () =>
          Promise<UpdateState>;

        download: () =>
          Promise<UpdateState>;

        install: () =>
          Promise<boolean>;

        onStateChange: (
          listener:
            UpdateStateListener
        ) => () => void;
      };
    };
  }
}