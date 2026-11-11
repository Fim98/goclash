import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { resolveGateway } from "./gateway/client";
import { TrayApp } from "./tray/tray-app";
import "./index.css";

// One bundle, two windows: the main window loads "/", the tray popup loads
// "/?window=tray" (see tray.go). Anything else falls back to the main window.
const isTray = new URLSearchParams(window.location.search).get("window") === "tray";

// Both windows mount only after the gateway is known: inside Wails that is the
// Go service, in a plain browser it is the in-memory demo data.
void resolveGateway().then((gateway) => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      {isTray ? <TrayApp gateway={gateway} /> : <App gateway={gateway} />}
    </React.StrictMode>,
  );
});
