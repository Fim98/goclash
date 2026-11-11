import { Cpu, FolderOpen, Network, Palette, Monitor, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/base/button";
import { Card, type CardShadow } from "@/components/base/card";
import { Progress } from "@/components/base/progress";
import { Segmented } from "@/components/base/segmented";
import { AsyncPanel } from "@/components/base/state-panel";
import { Switch } from "@/components/base/switch";
import type { CoreStatus, Gateway, ProxyMode, ServiceStatus, Settings } from "@/gateway/types";
import { applyTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { HeaderActions } from "@/shell/header-actions";
import { useAppStatus } from "@/shell/status-context";

const ACCENT_LABEL: Record<Settings["accent"], string> = {
  coral: "珊瑚",
  mint: "薄荷",
  sunny: "阳光",
};

const ACCENT_ORDER: Settings["accent"][] = ["coral", "mint", "sunny"];

export function SettingsPage({ gateway }: { gateway: Gateway }) {
  const { status, refresh: refreshStatus, setStatus } = useAppStatus();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [service, setService] = useState<ServiceStatus | null>(null);
  const [serviceBusy, setServiceBusy] = useState(false);
  const [core, setCore] = useState<CoreStatus | null>(null);
  const [coreBusy, setCoreBusy] = useState(false);
  const [coreError, setCoreError] = useState("");
  const [error, setError] = useState(false);

  const retry = useCallback(async () => {
    try {
      setSettings(await gateway.settings());
      setError(false);
    } catch {
      setError(true);
    }
  }, [gateway]);

  useEffect(() => {
    let cancelled = false;
    gateway.settings().then(
      (next) => {
        if (!cancelled) setSettings(next);
      },
      () => {
        if (!cancelled) setError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [gateway]);

  // TUN only works while the privileged daemon owns the core, so the row shows
  // the daemon state instead of offering a switch that cannot take effect.
  useEffect(() => {
    let cancelled = false;
    gateway.serviceStatus().then(
      (next) => {
        if (!cancelled) setService(next);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [gateway]);

  // The core card reads the disk once and then follows the download stream, so
  // a bar that starts in another window is still correct here.
  useEffect(() => {
    let cancelled = false;
    gateway.coreStatus().then(
      (next) => {
        if (!cancelled) setCore(next);
      },
      () => {},
    );
    const off = gateway.onCoreProgress((next) => setCore(next));
    return () => {
      cancelled = true;
      off();
    };
  }, [gateway]);

  async function runCoreAction(action: "check" | "download") {
    setCoreBusy(true);
    setCoreError("");
    try {
      setCore(action === "check" ? await gateway.checkCoreUpdate() : await gateway.downloadCore());
      if (action === "download") await refreshStatus();
    } catch (cause) {
      // Keep the card honest: re-read the disk instead of showing a version
      // that was never installed.
      setCoreError(cause instanceof Error ? cause.message : "内核操作失败");
      try {
        setCore(await gateway.coreStatus());
      } catch {
        // Leave the last known frame in place.
      }
    } finally {
      setCoreBusy(false);
    }
  }

  async function installService() {
    setServiceBusy(true);
    try {
      await gateway.installService();
      setService(await gateway.serviceStatus());
    } catch {
      // Canceled admin prompt or launchd refused the plist; the row stays put.
    } finally {
      setServiceBusy(false);
    }
  }

  async function removeService() {
    setServiceBusy(true);
    try {
      await gateway.removeService();
      setService(await gateway.serviceStatus());
    } catch {
      // Leave the row as it was.
    } finally {
      setServiceBusy(false);
    }
  }

  // Every control writes through immediately; the mock keeps the value so a
  // page switch and back still shows it.
  async function patch(next: Partial<Settings>) {
    setSettings((previous) => (previous ? { ...previous, ...next } : previous));
    try {
      await gateway.updateSettings(next);
    } catch {
      // The OS refused the change (or the kernel rejected it); re-read what is
      // stored so the control snaps back instead of lying.
      try {
        setSettings(await gateway.settings());
      } catch {
        setError(true);
      }
    } finally {
      if (next.systemProxy !== undefined || next.mode !== undefined || next.tun !== undefined) {
        await refreshStatus();
      }
    }
  }

  // Optimistic mode switch for the segmented control, mirroring the home page.
  async function changeMode(mode: ProxyMode) {
    if (!status || mode === status.mode) return;
    setStatus({ ...status, mode });
    await patch({ mode });
  }

  if (error) {
    return (
      <AsyncPanel
        state="error"
        error={{
          icon: <TriangleAlert />,
          title: "读取设置失败",
          description: "内核没有应答设置请求。稍后重试；若持续失败请查看日志。",
          actions: (
            <Button variant="ink" onClick={() => void retry()}>
              重试
            </Button>
          ),
        }}
      />
    );
  }

  if (!settings) return <AsyncPanel state="loading" />;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <HeaderActions>
        <Button
          variant="ghost"
          icon={<FolderOpen className="size-4" strokeWidth={2.5} />}
          onClick={() => void gateway.openConfigDirectory()}
        >
          打开配置目录
        </Button>
      </HeaderActions>

      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-5">
        <SettingsCard
          title="网络"
          hint="NETWORK"
          tone="mint"
          icon={<Network className="size-3.5" strokeWidth={2.4} />}
        >
          <Row label="系统代理">
            <Switch
              size="sm"
              label="系统代理"
              checked={settings.systemProxy}
              onCheckedChange={(next) => void patch({ systemProxy: next })}
            />
          </Row>
          <Row label="TUN 模式 · 需要系统服务">
            <div className="flex flex-none items-center gap-2">
              {service?.state === "running" ? (
                <button
                  type="button"
                  disabled={serviceBusy}
                  onClick={() => void removeService()}
                  className="cursor-pointer text-[10px] font-black underline decoration-2 underline-offset-2 disabled:opacity-40"
                >
                  服务运行中 · 卸载
                </button>
              ) : service?.state === "unsupported" ? (
                <span className="text-[10px] font-bold">当前系统不支持</span>
              ) : (
                <button
                  type="button"
                  disabled={serviceBusy}
                  onClick={() => void installService()}
                  className="h-7 cursor-pointer border-2 border-ink bg-surface px-2 text-[10px] font-black disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {serviceBusy ? "安装中…" : "安装服务"}
                </button>
              )}
              <Switch
                size="sm"
                label="TUN 模式"
                checked={settings.tun}
                disabled={service?.state === "unsupported"}
                onCheckedChange={(next) => void patch({ tun: next })}
              />
            </div>
          </Row>
          <Row label="混合端口">
            <ValueBox>{settings.mixedPort}</ValueBox>
          </Row>
          <Row label="允许局域网连接">
            <Switch
              size="sm"
              label="允许局域网连接"
              checked={settings.allowLan}
              onCheckedChange={(next) => void patch({ allowLan: next })}
            />
          </Row>
        </SettingsCard>

        <SettingsCard
          title="内核"
          hint="CORE"
          tone="sunny"
          icon={<Cpu className="size-3.5" strokeWidth={2.4} />}
        >
          <Row label="代理模式">
            <Segmented
              value={status?.mode ?? settings.mode}
              onChange={(mode) => void changeMode(mode)}
              ariaLabel="代理模式"
              options={[
                { value: "rule", label: "规则" },
                { value: "global", label: "全局" },
                { value: "direct", label: "直连" },
              ]}
              className="border-2 [&>button]:h-7 [&>button]:px-3 [&>button]:text-[10px]"
            />
          </Row>
          <Row label="日志等级">
            <ValueBox>{settings.logLevel}</ValueBox>
          </Row>
          <Row label="内核版本">
            <CoreVersionRow
              core={core}
              busy={coreBusy}
              error={coreError}
              onCheck={() => void runCoreAction("check")}
              onDownload={() => void runCoreAction("download")}
            />
          </Row>
          <Row label="内核自动更新">
            <Switch
              size="sm"
              label="内核自动更新"
              checked={settings.coreAutoUpdate}
              onCheckedChange={(next) => void patch({ coreAutoUpdate: next })}
            />
          </Row>
        </SettingsCard>

        <SettingsCard
          title="外观"
          hint="APPEARANCE"
          tone="coral"
          icon={<Palette className="size-3.5" strokeWidth={2.4} />}
        >
          <Row label="主题">
            <Segmented
              value={settings.theme}
              onChange={(theme) => {
                // Paint first, persist second: the window should not wait for
                // a round trip to change colour.
                applyTheme(theme);
                void patch({ theme });
              }}
              ariaLabel="主题"
              options={[
                { value: "light", label: "浅色" },
                { value: "dark", label: "深色" },
                { value: "system", label: "跟随" },
              ]}
              className="border-2 [&>button]:h-7 [&>button]:px-3 [&>button]:text-[10px]"
            />
          </Row>
          <Row label="菜单栏显示实时延迟">
            <Switch
              size="sm"
              label="菜单栏显示实时延迟"
              checked={settings.menuBarLatency}
              onCheckedChange={(next) => void patch({ menuBarLatency: next })}
            />
          </Row>
          <Row label="界面语言">
            <ValueBox>{settings.language}</ValueBox>
          </Row>
          <Row label="强调色">
            <div className="flex items-center gap-1.5">
              {ACCENT_ORDER.map((accent) => (
                <button
                  key={accent}
                  type="button"
                  aria-label={`强调色 ${ACCENT_LABEL[accent]}`}
                  aria-pressed={settings.accent === accent}
                  onClick={() => void patch({ accent })}
                  className={cn(
                    "size-6 cursor-pointer border-ink transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5",
                    settings.accent === accent ? "border-[3px]" : "border-2",
                  )}
                  style={{ background: `var(--color-${accent})` }}
                />
              ))}
            </div>
          </Row>
        </SettingsCard>

        <SettingsCard
          title="系统"
          hint="SYSTEM"
          tone="seafoam"
          icon={<Monitor className="size-3.5" strokeWidth={2.4} />}
        >
          <Row label="开机自动启动">
            <Switch
              size="sm"
              label="开机自动启动"
              checked={settings.launchAtLogin}
              onCheckedChange={(next) => void patch({ launchAtLogin: next })}
            />
          </Row>
          <Row label="静默启动 · 不显示主窗口">
            <Switch
              size="sm"
              label="静默启动"
              checked={settings.silentStart}
              onCheckedChange={(next) => void patch({ silentStart: next })}
            />
          </Row>
          <Row label="关闭窗口时">
            <ValueBox>{settings.closeAction === "tray" ? "最小化到托盘" : "退出程序"}</ValueBox>
          </Row>
          <Row label="更新通道">
            <ValueBox>{settings.channel === "stable" ? "稳定版" : "测试版"}</ValueBox>
          </Row>
        </SettingsCard>
      </div>
    </div>
  );
}

function SettingsCard({
  title,
  hint,
  tone,
  icon,
  children,
}: {
  title: string;
  hint: string;
  tone: CardShadow;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card shadow={tone} className="flex min-h-0 flex-col p-5">
      <div className="flex flex-none items-center gap-2.5">
        <span
          aria-hidden
          className="flex size-6 items-center justify-center border-2 border-ink text-on-accent"
          style={{ background: `var(--color-${tone})` }}
        >
          {icon}
        </span>
        <h2 className="text-[15px] font-black">{title}</h2>
        <span className="ml-auto text-[9px] font-black tracking-[1px]">{hint}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-between gap-3">
      <span className="text-xs font-black">{label}</span>
      {children}
    </div>
  );
}

function ValueBox({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-7 flex-none items-center border-2 border-ink px-3 text-[11px] font-black tabular-nums">
      {children}
    </span>
  );
}

/**
 * The one row that owns the core binary: what is installed, whether upstream has
 * something newer, and the download itself. While a download runs the row turns
 * into a bar — a spinner here would hide the only number that matters.
 */
function CoreVersionRow({
  core,
  busy,
  error,
  onCheck,
  onDownload,
}: {
  core: CoreStatus | null;
  busy: boolean;
  error: string;
  onCheck: () => void;
  onDownload: () => void;
}) {
  if (!core) return <ValueBox>—</ValueBox>;

  if (core.state === "downloading") {
    return (
      <div className="flex w-[164px] flex-none items-center gap-2">
        <Progress value={core.progress} label="内核下载进度" />
        <span className="w-8 text-right text-[10px] font-black tabular-nums">
          {Math.round(core.progress * 100)}%
        </span>
      </div>
    );
  }

  const outdated = core.state === "outdated" && core.latest !== "";
  const label = core.version ? `v${core.version}` : "未安装";

  return (
    <div className="flex flex-none flex-col items-end gap-0.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-black tabular-nums">
          {label}
          {outdated ? (
            <span className="text-coral">
              {" → "}v{core.latest}
            </span>
          ) : null}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={core.state === "ready" ? onCheck : onDownload}
          className="h-7 cursor-pointer border-2 border-ink bg-surface px-2 text-[10px] font-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "…" : core.state === "ready" ? "检查更新" : outdated ? "更新" : "下载内核"}
        </button>
      </div>
      {error ? (
        // The installed version stays visible: a failed download must not look
        // like an empty machine.
        <span className="max-w-[210px] truncate text-[9px] font-bold text-coral" title={error}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
