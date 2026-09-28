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


const DEFAULT_ANALYST_PERMISSIONS = new Set([
  "dashboard","tickets","my-operation","known-problems","attention","data-quality","clients",
  "simer-map","performance","reports","corrections","evolutions","support","versions","knowledge",
]);

export function requirePermission(permission: string) {
  return (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    const auth = request.auth;
    if (!auth) return response.status(401).json({ message: "Autenticação necessária." });
    if (auth.role === "ADMIN") return next();

    const allowed = Array.isArray(auth.permissions)
      ? auth.permissions.includes(permission)
      : auth.role === "COORDENADOR" || DEFAULT_ANALYST_PERMISSIONS.has(permission);

    if (!allowed) {
      return response.status(403).json({
        message: "Você não possui permissão para acessar esta rotina.",
        permission,
      });
    }
    return next();
  };
}
