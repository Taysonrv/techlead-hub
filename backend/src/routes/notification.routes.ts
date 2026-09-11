import {
  Router,
} from "express";

import {
  NotificationController,
} from "../controllers/NotificationController";

const notificationRoutes = Router();
const controller = new NotificationController();

notificationRoutes.get("/", controller.list);
notificationRoutes.post("/read", controller.markRead);
notificationRoutes.put("/preferences", controller.savePreferences);

export {
  notificationRoutes,
};
