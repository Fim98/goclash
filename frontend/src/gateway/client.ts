import { Call, Events } from "@wailsio/runtime";

import { createMockGateway } from "./mock";
import type { Gateway, LogLine, TrafficSample } from "./types";

/**
 * Bridge to the Go gateway service (`main.Gateway.*`). The service lives in the
 * main package, so the FQN is package.Type.Method.
 *
 * Why Call.ByName instead of generated bindings: the binding surface is one
 * service with a stable name, and the generated files would need a `wails3
 * generate` step in the build for something we can express in ten lines.
 */
function call<T>(method: string, ...args: unknown[]): Promise<T> {
  return Call.ByName(`main.Gateway.${method}`, ...args) as Promise<T>;
}

export function createWailsGateway(): Gateway {
  return {
    status: () => call("Status"),
    groups: () => call("Groups"),
    select: (groupId, nodeName) => call("Select", groupId, nodeName),
    testGroup: (groupId) => call("TestGroup", groupId),
    testAllGroups: () => call("TestAllGroups"),
    setMode: (mode) => call("SetMode", mode),
    setSystemProxy: (on) => call("SetSystemProxy", on),
    refreshExitIP: () => call("RefreshExitIP"),
    serviceStatus: () => call("ServiceStatus"),
    installService: () => call("InstallService"),
    removeService: () => call("RemoveService"),
    restartCore: () => call("RestartCore"),

    connections: () => call("Connections"),
    closeConnection: (id) => call("CloseConnection", id),
    closeAllConnections: () => call("CloseAllConnections"),

    rules: () => call("Rules"),
    reloadRules: () => call("ReloadRules"),
    clearLogs: () => call("ClearLogs"),
    openLogDirectory: () => call("OpenLogDirectory"),
    openConfigDirectory: () => call("OpenConfigDirectory"),

    profiles: () => call("Profiles"),
    addProfile: (url) => call("AddProfile", url),
    removeProfile: (id) => call("RemoveProfile", id),
    refreshProfile: (id) => call("RefreshProfile", id),

    settings: () => call("Settings"),
    updateSettings: (patch) => call("UpdateSettings", patch),

    onProfilesChanged(handler) {
      const off = Events.On("gateway:profiles", () => handler());
      return () => off();
    },

    subscribe(stream, handler) {
      const name = `gateway:${stream}`;
      const off = Events.On(name, (event) => {
        handler(event.data as TrafficSample | LogLine);
      });
      return () => off();
    },
  };
}

/**
 * Picks the real gateway when the Go bridge answers, demo data otherwise
 * (plain browser preview and tests). The probe never touches the kernel, so a
 * missing kernel still gets the real gateway — the pages then show their error
 * panels instead of quietly pretending everything works.
 */
export async function resolveGateway(): Promise<Gateway> {
  try {
    const available = await Call.ByName("main.Gateway.Ping");
    if (available === true) return createWailsGateway();
  } catch {
    // No Wails host: fall through to the mock.
  }
  return createMockGateway();
}
