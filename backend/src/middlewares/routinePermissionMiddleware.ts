import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "./authMiddleware";

const DEFAULT_ANALYST_PERMISSIONS = new Set([
  "dashboard","tickets","known-problems","attention","clients",
  "reports","corrections","evolutions","support","versions","knowledge",
]);

export function hasRoutinePermission(request: AuthenticatedRequest, permission: string) {
  const auth = request.auth;
  if (!auth) return false;
  if (auth.role === "ADMIN") return true;
  return Array.isArray(auth.permissions)
    ? auth.permissions.includes(permission)
    : auth.role === "COORDENADOR" || DEFAULT_ANALYST_PERMISSIONS.has(permission);
}

export function requireAnyPermission(...permissions: string[]) {
  return (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    if (!request.auth) return response.status(401).json({ message: "Autenticação necessária." });
    if (permissions.some((permission) => hasRoutinePermission(request, permission))) return next();
    return response.status(403).json({
      message: "Você não possui permissão para acessar esta rotina. Procure um administrador para solicitar a liberação do acesso.",
      permissions,
    });
  };
}
