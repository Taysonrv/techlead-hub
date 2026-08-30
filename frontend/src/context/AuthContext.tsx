import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  api,
  getAccessToken,
  removeAccessToken,
  setAccessToken,
} from "../services/api";

/* =========================================================
   TIPOS
========================================================= */

export type UserRole =
  | "ADMIN"
  | "COORDENADOR"
  | "ANALISTA";

export type AuthUser = {
  id:
    number;

  name:
    string;

  username:
    string;

  email:
    string | null;

  role:
    UserRole;

  active:
    boolean;

  mustChangePassword:
    boolean;

  lastLoginAt?:
    string | null;

  createdAt?:
    string;

  updatedAt?:
    string;
};

type LoginInput = {
  username:
    string;

  password:
    string;

  deviceName?:
    string;
};

type ChangePasswordInput = {
  currentPassword:
    string;

  newPassword:
    string;

  confirmPassword:
    string;
};

type LoginResponse = {
  accessToken:
    string;

  tokenType:
    string;

  expiresAt:
    string;

  user:
    AuthUser;
};

type ChangePasswordResponse = {
  message:
    string;

  user:
    AuthUser;
};

type AuthContextData = {
  user:
    AuthUser | null;

  loading:
    boolean;

  authenticated:
    boolean;

  login:
    (
      input:
        LoginInput
    ) =>
      Promise<AuthUser>;

  logout:
    () =>
      Promise<void>;

  refreshUser:
    () =>
      Promise<AuthUser | null>;

  changePassword:
    (
      input:
        ChangePasswordInput
    ) =>
      Promise<AuthUser>;
};

/* =========================================================
   CONTEXT
========================================================= */

const AuthContext =
  createContext<
    AuthContextData |
    undefined
  >(
    undefined
  );

/* =========================================================
   PROVIDER
========================================================= */

type Props = {
  children:
    ReactNode;
};

export function AuthProvider({
  children,
}: Props) {
  const [
    user,
    setUser,
  ] =
    useState<
      AuthUser | null
    >(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  /* =======================================================
     LIMPAR SESSÃO LOCAL
  ======================================================= */

  const clearSession =
    useCallback(() => {
      removeAccessToken();

      setUser(
        null
      );
    }, []);

  /* =======================================================
     CARREGAR USUÁRIO ATUAL
  ======================================================= */

  const refreshUser =
    useCallback(
      async () => {
        const token =
          getAccessToken();

        if (!token) {
          setUser(
            null
          );

          return null;
        }

        try {
          const response =
            await api.get<{
              user:
                AuthUser;
            }>(
              "/auth/me"
            );

          const currentUser =
            response.data
              .user;

          setUser(
            currentUser
          );

          return currentUser;
        } catch {
          clearSession();

          return null;
        }
      },
      [
        clearSession,
      ]
    );

  /* =======================================================
     RESTAURAR SESSÃO AO INICIAR
  ======================================================= */

  useEffect(() => {
    let mounted =
      true;

    async function restoreSession() {
      try {
        await refreshUser();
      } finally {
        if (
          mounted
        ) {
          setLoading(
            false
          );
        }
      }
    }

    void restoreSession();

    return () => {
      mounted =
        false;
    };
  }, [
    refreshUser,
  ]);

  /* =======================================================
     EVENTO GLOBAL DE 401
  ======================================================= */

  useEffect(() => {
    function handleUnauthorized() {
      clearSession();
    }

    window.addEventListener(
      "techlead-hub:unauthorized",
      handleUnauthorized
    );

    return () => {
      window.removeEventListener(
        "techlead-hub:unauthorized",
        handleUnauthorized
      );
    };
  }, [
    clearSession,
  ]);

  /* =======================================================
     LOGIN
  ======================================================= */

  const login =
    useCallback(
      async ({
        username,
        password,
        deviceName,
      }: LoginInput) => {
        const response =
          await api.post<
            LoginResponse
          >(
            "/auth/login",
            {
              username,
              password,

              deviceName:
                deviceName ??
                getDefaultDeviceName(),
            }
          );

        const {
          accessToken,
          user:
            authenticatedUser,
        } =
          response.data;

        setAccessToken(
          accessToken
        );

        setUser(
          authenticatedUser
        );

        return authenticatedUser;
      },
      []
    );

  /* =======================================================
     ALTERAR SENHA
  ======================================================= */

  const changePassword =
    useCallback(
      async ({
        currentPassword,
        newPassword,
        confirmPassword,
      }: ChangePasswordInput) => {
        const response =
          await api.post<
            ChangePasswordResponse
          >(
            "/auth/change-password",
            {
              currentPassword,
              newPassword,
              confirmPassword,
            }
          );

        const updatedUser =
          response.data
            .user;

        /*
         * Mantém o contexto sincronizado imediatamente.
         *
         * Exemplo:
         * mustChangePassword: true
         *               ↓
         * mustChangePassword: false
         */
        setUser(
          updatedUser
        );

        return updatedUser;
      },
      []
    );

  /* =======================================================
     LOGOUT
  ======================================================= */

  const logout =
    useCallback(
      async () => {
        try {
          if (
            getAccessToken()
          ) {
            await api.post(
              "/auth/logout"
            );
          }
        } catch (
          error
        ) {
          console.warn(
            "[auth] Não foi possível encerrar a sessão no servidor:",
            error
          );
        } finally {
          clearSession();
        }
      },
      [
        clearSession,
      ]
    );

  /* =======================================================
     VALUE
  ======================================================= */

  const value =
    useMemo<
      AuthContextData
    >(
      () => ({
        user,

        loading,

        authenticated:
          Boolean(
            user
          ),

        login,

        logout,

        refreshUser,

        changePassword,
      }),
      [
        user,
        loading,
        login,
        logout,
        refreshUser,
        changePassword,
      ]
    );

  return (
    <AuthContext.Provider
      value={
        value
      }
    >
      {children}
    </AuthContext.Provider>
  );
}

/* =========================================================
   HOOK
========================================================= */

export function useAuth() {
  const context =
    useContext(
      AuthContext
    );

  if (!context) {
    throw new Error(
      "useAuth precisa ser utilizado dentro de AuthProvider."
    );
  }

  return context;
}

/* =========================================================
   DISPOSITIVO
========================================================= */

function getDefaultDeviceName() {
  try {
    const platform =
      window.techLeadHub
        ?.platform;

    if (
      window.techLeadHub
        ?.desktop
    ) {
      return platform
        ? `TechLead Hub Desktop - ${platform}`
        : "TechLead Hub Desktop";
    }

    return "TechLead Hub Web";
  } catch {
    return "TechLead Hub";
  }
}