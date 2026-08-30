import type {
  ReactNode,
} from "react";

import {
  Box,
  CircularProgress,
} from "@mui/material";

import {
  Navigate,
  useLocation,
} from "react-router-dom";

import {
  useAuth,
} from "../context/AuthContext";

/* =========================================================
   PROTECTED ROUTE
========================================================= */

export function ProtectedRoute({
  children,
}: {
  children:
    ReactNode;
}) {
  const {
    authenticated,
    loading,
  } =
    useAuth();

  const location =
    useLocation();

  if (loading) {
    return (
      <Box
        sx={{
          minHeight:
            "100vh",

          display:
            "flex",

          alignItems:
            "center",

          justifyContent:
            "center",

          backgroundColor:
            "#f5f7fa",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (
    !authenticated
  ) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from:
            location.pathname,
        }}
      />
    );
  }

  return (
    <>
      {children}
    </>
  );
}