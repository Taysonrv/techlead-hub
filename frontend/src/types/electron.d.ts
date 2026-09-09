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

      configuration: {
        get: () => Promise<{
          databaseConfigured: boolean;
          organization: string;
          project: string;
          wiki: string;
          patConfigured: boolean;
          smtpHost: string;
          smtpPort: string;
          smtpSecure: boolean;
          smtpUser: string;
          smtpFrom: string;
          smtpPasswordConfigured: boolean;
          emailConfigured: boolean;
        }>;

        importEnv: () => Promise<{
          databaseUrl: string;
          organization: string;
          project: string;
          wiki: string;
          pat: string;
          smtpHost: string;
          smtpPort: string;
          smtpSecure: string;
          smtpUser: string;
          smtpPassword: string;
          smtpFrom: string;
        } | null>;

        save: (input: {
          databaseUrl: string;
          organization: string;
          project: string;
          wiki: string;
          pat: string;
          smtpHost: string;
          smtpPort: string;
          smtpSecure: string;
          smtpUser: string;
          smtpPassword: string;
          smtpFrom: string;
        }) => Promise<{
          success: boolean;
          restartRequired: boolean;
        }>;
      };

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
