import {
  Router,
} from "express";

import {
  UserController,
} from "../controllers/UserController";

/* =========================================================
   ROUTER
========================================================= */

const userRoutes =
  Router();

const users =
  new UserController();

/* =========================================================
   USUÁRIOS
========================================================= */

/*
 * A autenticação é aplicada globalmente em:
 *
 * routes.use("/api", authMiddleware)
 *
 * no index.ts.
 *
 * A autorização administrativa continua sendo validada
 * pelo UserService.
 */

userRoutes.get(
  "/",
  users.index.bind(
    users
  )
);

userRoutes.get(
  "/pending",
  users.pending.bind(
    users
  )
);

userRoutes.patch(
  "/:id/approve",
  users.approve.bind(
    users
  )
);

userRoutes.patch(
  "/:id/reject",
  users.reject.bind(
    users
  )
);

userRoutes.patch(
  "/:id/activate",
  users.activate.bind(
    users
  )
);

userRoutes.patch(
  "/:id/deactivate",
  users.deactivate.bind(
    users
  )
);

/* =========================================================
   EXPORT
========================================================= */

export default userRoutes;