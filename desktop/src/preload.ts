import {
  contextBridge,
} from "electron";

contextBridge.exposeInMainWorld(
  "techLeadHub",
  {
    platform:
      process.platform,

    desktop: true,

    version:
      process.env
        .npm_package_version ??
      "0.1.0-beta",
  }
);