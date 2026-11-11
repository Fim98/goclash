import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { TrayApp } from "./tray/tray-app";
import "./index.css";

// One bundle, two windows: the main window loads "/", the tray popup loads
// "/?window=tray" (see tray.go). Anything else falls back to the main window.
const isTray = new URLSearchParams(window.location.search).get("window") === "tray";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isTray ? <TrayApp /> : <App />}</React.StrictMode>,
);
