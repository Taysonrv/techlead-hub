import {
  app,
  BrowserWindow,
  shell,
} from "electron";

import path from "node:path";

let mainWindow:
  | BrowserWindow
  | null = null;

function createWindow() {
  mainWindow =
    new BrowserWindow({
      width: 1440,
      height: 900,

      minWidth: 1100,
      minHeight: 700,

      show: false,

      title:
        "TechLead Hub",

      backgroundColor:
        "#f5f7fa",

      webPreferences: {
        preload:
          path.join(
            __dirname,
            "preload.js"
          ),

        contextIsolation:
          true,

        nodeIntegration:
          false,

        sandbox:
          true,
      },
    });

  mainWindow.loadURL(
    "http://localhost:5173"
  );

  mainWindow.once(
    "ready-to-show",
    () => {
      mainWindow?.show();
    }
  );

  mainWindow.webContents.setWindowOpenHandler(
    ({ url }) => {
      if (
        url.startsWith(
          "https://suporte.aliare.co/"
        )
      ) {
        shell.openExternal(
          url
        );

        return {
          action: "deny",
        };
      }

      if (
        url.startsWith(
          "http://"
        ) ||
        url.startsWith(
          "https://"
        )
      ) {
        shell.openExternal(
          url
        );

        return {
          action: "deny",
        };
      }

      return {
        action: "deny",
      };
    }
  );

  mainWindow.on(
    "closed",
    () => {
      mainWindow = null;
    }
  );
}

app.whenReady().then(
  () => {
    createWindow();

    app.on(
      "activate",
      () => {
        if (
          BrowserWindow.getAllWindows()
            .length === 0
        ) {
          createWindow();
        }
      }
    );
  }
);

app.on(
  "window-all-closed",
  () => {
    if (
      process.platform !==
      "darwin"
    ) {
      app.quit();
    }
  }
);