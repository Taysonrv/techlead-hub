import axios from "axios";

import type {
  AxiosError,
  InternalAxiosRequestConfig,
} from "axios";

const DEFAULT_API_URL =
  "http://localhost:3333/api";

const API_URL =
  import.meta.env
    .VITE_API_URL?.trim() ||
  DEFAULT_API_URL;

const ACCESS_TOKEN_KEY =
  "techlead-hub.access-token";

/* =========================================================
   STORAGE DA SESSÃO
========================================================= */

export function getAccessToken() {
  try {
    return localStorage.getItem(
      ACCESS_TOKEN_KEY
    );
  } catch {
    return null;
  }
}

export function setAccessToken(
  token:
    string
) {
  try {
    localStorage.setItem(
      ACCESS_TOKEN_KEY,
      token
    );
  } catch {
    console.warn(
      "[auth] Não foi possível armazenar o token."
    );
  }
}

export function removeAccessToken() {
  try {
    localStorage.removeItem(
      ACCESS_TOKEN_KEY
    );
  } catch {
    console.warn(
      "[auth] Não foi possível remover o token."
    );
  }
}

/* =========================================================
   INSTÂNCIA AXIOS
========================================================= */

export const api =
  axios.create({
    baseURL:
      API_URL,

    timeout:
      15000,

    headers: {
      Accept:
        "application/json",
    },
  });

/* =========================================================
   REQUEST INTERCEPTOR

   Injeta automaticamente:

   Authorization: Bearer <token>
========================================================= */

api.interceptors.request.use(
  (
    config:
      InternalAxiosRequestConfig
  ) => {
    const token =
      getAccessToken();

    if (token) {
      config.headers.Authorization =
        `Bearer ${token}`;
    }

    return config;
  },

  (error) =>
    Promise.reject(error)
);

/* =========================================================
   RESPONSE INTERCEPTOR

   Centraliza tratamento de sessão expirada.
========================================================= */

api.interceptors.response.use(
  (response) =>
    response,

  (
    error:
      AxiosError
  ) => {
    const status =
      error.response
        ?.status;

    /*
     * Não removemos token quando o próprio endpoint
     * de login retorna 401.
     */
    const requestUrl =
      error.config
        ?.url ??
      "";

    const isLoginRequest =
      requestUrl.includes(
        "/auth/login"
      );

    if (
      status === 401 &&
      !isLoginRequest
    ) {
      removeAccessToken();

      /*
       * O AuthContext escutará este evento.
       *
       * Dessa forma evitamos importar React ou navegar
       * diretamente dentro da camada de API.
       */
      window.dispatchEvent(
        new CustomEvent(
          "techlead-hub:unauthorized"
        )
      );
    }

    return Promise.reject(
      error
    );
  }
);

/* =========================================================
   HELPERS
========================================================= */

export function getApiBaseUrl() {
  return API_URL;
}