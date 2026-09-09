import {
  Router,
} from "express";

import {
  NotificationController,
} from "../controllers/NotificationController";

const notificationRoutes = Router();
const controller = new NotificationController();

notificationRoutes.get("/", controller.list);

export {
  notificationRoutes,
};
