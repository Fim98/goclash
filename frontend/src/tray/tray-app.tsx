import { FolderOpen, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/base/button";
import { Card } from "@/components/base/card";
import { Segmented } from "@/components/base/segmented";
import { Switch } from "@/components/base/switch";
import { createMockGateway } from "@/gateway/mock";
import type { Gateway, ProxyGroup, ProxyMode, Status, TrafficSample } from "@/gateway/types";
import { formatLatency, formatSpeedFixed } from "@/lib/format";
import { cn } from "@/lib/utils";

const NODE_ROWS = 4;

/** Ask the Go host to hide the popup or raise the main window. */
async function notifyHost(event: "tray:hide" | "tray:open-main") {
  try {
    const { Events } = await import("@wailsio/runtime");
    Events.Emit(event);
  } catch {
    // Browser preview and tests have no Wails host; the click is a no-op.
  }
}

/**
 * The 420×620 tray popup from board 03. It runs in its own webview (loaded as
 * "/?window=tray"), so it owns a gateway instance of its own; both windows will
 * share state once the gateway moves to the Go side.
 */
export function TrayApp({ gateway }: { gateway?: Gateway }) {
  const gw = useMemo(() => gateway ?? createMockGateway(), [gateway]);
  const [status, setStatus] = useState<Status | null>(null);
  const [groups, setGroups] = useState<ProxyGroup[] | null>(null);
  const [error, setError] = useState(false);
  const [latest, setLatest] = useState<TrafficSample | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([gw.status(), gw.groups()]).then(
      ([nextStatus, nextGroups]) => {
        if (cancelled) return;
        setStatus(nextStatus);
        setGroups(nextGroups);
      },
      () => {
        if (!cancelled) setError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [gw]);

  useEffect(
    () =>
      gw.subscribe("traffic", (event) => {
        if (!("connections" in event)) return;
        setLatest(event);
      }),
    [gw],
  );

  async function refreshPairs() {
    const [nextStatus, nextGroups] = await Promise.all([gw.status(), gw.groups()]);
    setStatus(nextStatus);
    setGroups(nextGroups);
  }

  async function toggleProxy(next: boolean) {
    if (!status) return;
    setStatus({ ...status, systemProxy: next, connected: next });
    try {
      await gw.setSystemProxy(next);
    } finally {
      await refreshPairs();
    }
  }

  async function changeMode(mode: ProxyMode) {
    if (!status || mode === status.mode) return;
    setStatus({ ...status, mode });
    try {
      await gw.setMode(mode);
    } finally {
      await refreshPairs();
    }
  }

  async function pick(nodeName: string) {
    try {
      await gw.select("proxy", nodeName);
    } finally {
      await refreshPairs();
    }
  }

  return (
    <div className="flex h-dvh w-full flex-col border-4 border-ink bg-surface text-ink">
      <header className="flex h-10 flex-none items-center gap-2 border-b-4 border-ink px-4">
        <i aria-hidden className="size-2.5 border-2 border-ink bg-coral" />
        <span className="text-[13px] font-black">GoClash</span>
        <button
          type="button"
          aria-label="关闭浮窗"
          onClick={() => void notifyHost("tray:hide")}
          className="ml-auto flex size-6 cursor-pointer items-center justify-center border-2 border-ink bg-surface"
        >
          <X className="size-3" strokeWidth={3} />
        </button>
      </header>

      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-[11px] font-bold">内核没有应答，稍后重试或打开主界面查看日志。</p>
          <Button variant="ghost" onClick={() => window.location.reload()}>
            重新载入
          </Button>
        </div>
      ) : !status || !groups ? (
        <div className="grid flex-1 place-items-center text-[11px] font-bold">
          正在读取内核状态…
        </div>
      ) : (
        <TrayBody
          status={status}
          groups={groups}
          latest={latest}
          onToggleProxy={(next) => void toggleProxy(next)}
          onMode={(mode) => void changeMode(mode)}
          onPick={(name) => void pick(name)}
        />
      )}
    </div>
  );
}

function TrayBody({
  status,
  groups,
  latest,
  onToggleProxy,
  onMode,
  onPick,
}: {
  status: Status;
  groups: ProxyGroup[];
  latest: TrafficSample | null;
  onToggleProxy: (next: boolean) => void;
  onMode: (mode: ProxyMode) => void;
  onPick: (name: string) => void;
}) {
  const main = groups.find((group) => group.id === "proxy") ?? groups[0];
  const nodes = main
    ? main.nodes
        .slice()
        .sort(
          (a, b) => (a.latency ?? Number.MAX_SAFE_INTEGER) - (b.latency ?? Number.MAX_SAFE_INTEGER),
        )
        .slice(0, NODE_ROWS)
    : [];
  const connected = status.connected;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <Card
        shadow="mint"
        shadowSize={6}
        className={cn(
          "flex h-[104px] flex-none -rotate-1 items-center justify-between px-4",
          connected ? "bg-coral text-on-accent" : "bg-surface",
        )}
      >
        <div className="min-w-0">
          <div className="text-2xl font-black leading-[28px] tracking-[-1px]">
            {connected ? "已连接" : "未连接"}
          </div>
          <div className="mt-1 truncate text-[10px] font-black">
            {connected
              ? `${status.exitNode} · ${formatLatency(status.exitLatency)}`
              : "系统代理已关闭"}
          </div>
        </div>
        <Switch
          size="md"
          label="系统代理"
          checked={status.systemProxy}
          onCheckedChange={onToggleProxy}
        />
      </Card>

      <Segmented
        value={status.mode}
        onChange={onMode}
        ariaLabel="代理模式"
        options={[
          { value: "rule", label: "规则" },
          { value: "global", label: "全局" },
          { value: "direct", label: "直连" },
        ]}
        className="w-full [&>button]:flex-1"
      />

      <div className="flex items-center text-[9px] font-black tracking-[0.6px]">
        <span>节点 · {main?.name ?? "—"}</span>
        <span className="ml-auto font-bold">按延迟排序</span>
      </div>

      <div className="flex flex-col gap-2">
        {nodes.map((node) => {
          const selected = main?.selected === node.name;
          return (
            <button
              key={node.name}
              type="button"
              aria-pressed={selected}
              onClick={() => onPick(node.name)}
              className={cn(
                "flex h-11 items-center justify-between border-ink px-2.5 text-left",
                selected
                  ? "border-[3px] bg-sunny"
                  : "border-2 bg-surface transition-colors hover:bg-sunny/40",
              )}
            >
              <span className="truncate text-xs font-bold">{node.name}</span>
              <span className="ml-2 flex-none text-[10px] font-black tabular-nums">
                {formatLatency(node.latency)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-2.5">
        <TrafficBox label="下载" value={latest ? formatSpeedFixed(latest.down) : "—"} />
        <TrafficBox label="上传" value={latest ? formatSpeedFixed(latest.up) : "—"} />
      </div>

      <Button
        variant="ghost"
        className="mt-auto h-[46px] w-full"
        icon={<FolderOpen className="size-3.5" strokeWidth={2.5} />}
        onClick={() => void notifyHost("tray:open-main")}
      >
        打开主界面
      </Button>
    </div>
  );
}

function TrafficBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-[60px] flex-1 flex-col justify-center border-2 border-ink px-2.5">
      <div className="text-[9px] font-bold">{label}</div>
      <div className="mt-0.5 truncate text-base font-black tabular-nums">{value}</div>
    </div>
  );
}
