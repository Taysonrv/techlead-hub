import type { NextFunction, Response } from "express";
import type {
  AuthenticatedRequest,
  AuthenticatedUserRole,
} from "./authMiddleware";

export function requireRoles(
  ...allowedRoles: AuthenticatedUserRole[]
) {
  const allowed = new Set(allowedRoles);

  return (
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ) => {
    const role = request.auth?.role;

    if (!role) {
      return response.status(401).json({
        message: "Autenticação necessária.",
      });
    }

    if (!allowed.has(role)) {
      return response.status(403).json({
        message: "Você não possui permissão para executar esta operação.",
      });
    }

    return next();
  };
}
