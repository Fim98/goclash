import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { resolveGateway } from "./gateway/client";
import { applyTheme } from "./lib/theme";
import { TrayApp } from "./tray/tray-app";
import "./index.css";

// One bundle, two windows: the main window loads "/", the tray popup loads
// "/?window=tray" (see tray.go). Anything else falls back to the main window.
const isTray = new URLSearchParams(window.location.search).get("window") === "tray";

// Both windows mount only after the gateway is known: inside Wails that is the
// Go service, in a plain browser it is the in-memory demo data. The theme is
// applied first so a dark window never flashes white.
void resolveGateway().then(async (gateway) => {
  const settings = await gateway.settings().catch(() => null);
  applyTheme(settings?.theme ?? "light");

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      {isTray ? <TrayApp gateway={gateway} /> : <App gateway={gateway} />}
    </React.StrictMode>,
  );
});
