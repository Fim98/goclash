import { beforeEach, describe, expect, it, vi } from "vitest";

import { createWailsGateway, resolveGateway } from "./client";

const { callByName, on } = vi.hoisted(() => ({
  callByName: vi.fn(),
  on: vi.fn((_name: string, _listener: (event: { data: unknown }) => void) => () => {}),
}));

vi.mock("@wailsio/runtime", () => ({
  Call: { ByName: callByName },
  Events: { On: on },
}));

describe("Wails gateway bridge", () => {
  beforeEach(() => {
    callByName.mockReset();
    on.mockClear();
  });

  it("routes every method to the Go service by fully qualified name", async () => {
    callByName.mockResolvedValue(undefined);
    const gateway = createWailsGateway();

    await gateway.select("proxy", "香港 · IPLC 02");
    expect(callByName).toHaveBeenCalledWith("main.Gateway.Select", "proxy", "香港 · IPLC 02");

    await gateway.updateSettings({ systemProxy: false });
    expect(callByName).toHaveBeenCalledWith("main.Gateway.UpdateSettings", {
      systemProxy: false,
    });

    await gateway.status();
    expect(callByName).toHaveBeenCalledWith("main.Gateway.Status");
  });

  it("subscribes to typed streams and unsubscribes cleanly", () => {
    const off = vi.fn();
    on.mockReturnValueOnce(off);

    const gateway = createWailsGateway();
    const handler = vi.fn();
    const unsubscribe = gateway.subscribe("traffic", handler);

    expect(on).toHaveBeenCalledWith("gateway:traffic", expect.any(Function));

    const listener = on.mock.calls[0][1];
    const sample = { down: 1, up: 2, connections: 3 };
    listener({ data: sample });
    expect(handler).toHaveBeenCalledWith(sample);

    unsubscribe();
    expect(off).toHaveBeenCalled();
  });

  it("listens for background profile refreshes", () => {
    const off = vi.fn();
    on.mockReturnValueOnce(off);

    const gateway = createWailsGateway();
    const handler = vi.fn();
    const unsubscribe = gateway.onProfilesChanged(handler);

    expect(on).toHaveBeenCalledWith("gateway:profiles", expect.any(Function));

    on.mock.calls[0][1]({ data: null });
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(off).toHaveBeenCalled();
  });

  it("falls back to demo data when the bridge is missing", async () => {
    callByName.mockRejectedValue(new Error("ReferenceError: no wails host"));

    const gateway = await resolveGateway();
    // The mock answers with the seeded demo status.
    const status = await gateway.status();
    expect(status.exitNode).toBe("香港 · IPLC 02");
  });

  it("keeps the real gateway when the bridge answers, even if the kernel is down", async () => {
    callByName.mockImplementation((method: string) =>
      method === "main.Gateway.Ping"
        ? Promise.resolve(true)
        : Promise.reject(new Error("kernel offline")),
    );

    const gateway = await resolveGateway();

    await expect(gateway.status()).rejects.toThrow("kernel offline");
  });
});
