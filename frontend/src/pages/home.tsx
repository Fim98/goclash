import {
  ArrowDown,
  ArrowUp,
  Link2,
  RefreshCw,
  ScrollText,
  Settings,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button, IconButton } from "@/components/base/button";
import { Card } from "@/components/base/card";
import { Segmented } from "@/components/base/segmented";
import { StatCard } from "@/components/base/stat";
import { AsyncPanel } from "@/components/base/state-panel";
import { Switch } from "@/components/base/switch";
import { Tag } from "@/components/base/tag";
import type { Gateway, ProxyMode, Status, TrafficSample } from "@/gateway/types";
import { formatLatency, formatSpeedFixed } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HeaderActions } from "@/shell/header-actions";
import { useAppStatus } from "@/shell/status-context";
import type { PageNavigate } from "@/shell/pages";

import { TrafficChart } from "./traffic-chart";

/** Rolling window behind the chart; the gateway ticks at 1 Hz. */
const TRAFFIC_WINDOW = 60;

const MODE_LABEL: Record<ProxyMode, string> = { rule: "规则", global: "全局", direct: "直连" };

const MODE_CAPTION: Record<ProxyMode, string> = {
  rule: "按规则集自动分流，命中即走对应策略组",
  global: "全部流量经当前节点转发，不做分流",
  direct: "全部流量直连，不经过任何节点",
};

const RANGE_OPTIONS = [
  { value: "1m", label: "1m" },
  { value: "5m", label: "5m" },
  { value: "1h", label: "1h" },
] as const;

type RangeValue = (typeof RANGE_OPTIONS)[number]["value"];

export function HomePage({ gateway, navigate }: { gateway: Gateway; navigate: PageNavigate }) {
  const { status, error, setStatus, refresh } = useAppStatus();
  const [samples, setSamples] = useState<TrafficSample[]>([]);
  const [range, setRange] = useState<RangeValue>("1m");

  useEffect(
    () =>
      gateway.subscribe("traffic", (event) => {
        if (!("connections" in event)) return;
        setSamples((previous) => [...previous, event].slice(-TRAFFIC_WINDOW));
      }),
    [gateway],
  );

  if (error) {
    return (
      <AsyncPanel
        state="error"
        error={{
          icon: <TriangleAlert />,
          title: "内核暂时不可用",
          description: "无法从内核读取代理信息。重启内核通常可恢复；若持续失败请查看日志。",
          actions: (
            <>
              <Button variant="ink" onClick={() => void restartCore(gateway, refresh)}>
                重启内核
              </Button>
              <Button variant="ghost" onClick={() => navigate("logs")}>
                <ScrollText className="size-4" strokeWidth={2.5} />
                打开日志
              </Button>
            </>
          ),
        }}
      />
    );
  }

  if (!status) return <AsyncPanel state="loading" />;

  const latest = samples.length > 0 ? samples[samples.length - 1] : undefined;

  async function refreshExit() {
    try {
      setStatus(await gateway.refreshExitIP());
    } catch {
      // The lookup degrades to an empty card; a status refresh still updates
      // the kernel-side parts.
      await refresh();
    }
  }

  async function toggleSystemProxy() {
    if (!status) return;
    const next = !status.systemProxy;
    setStatus({ ...status, systemProxy: next, connected: next });
    try {
      await gateway.setSystemProxy(next);
    } catch {
      // The gateway refuses when the OS call fails; the refresh below restores
      // the switch to what the kernel actually reports.
    } finally {
      await refresh();
    }
  }

  async function changeMode(mode: ProxyMode) {
    if (!status || mode === status.mode) return;
    setStatus({ ...status, mode });
    try {
      await gateway.setMode(mode);
    } catch {
      // A rejected patch leaves the mode untouched; refresh restores it.
    } finally {
      await refresh();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <HeaderActions>
        <IconButton size="md" aria-label="打开设置" onClick={() => navigate("settings")}>
          <Settings className="size-4" strokeWidth={2.5} />
        </IconButton>
        <Button
          icon={<Zap className="size-3.5" strokeWidth={2.5} />}
          onClick={() => void gateway.testAllGroups()}
        >
          立即测速
        </Button>
      </HeaderActions>

      <Hero status={status} latest={latest} onToggle={() => void toggleSystemProxy()} />

      <div className="grid h-[108px] flex-none grid-cols-3 gap-5">
        <StatCard
          label="下载速度"
          value={
            latest ? (
              formatSpeedFixed(latest.down)
            ) : (
              <span aria-hidden className="block h-8 w-28 border-2 border-ink" />
            )
          }
          icon={<ArrowDown strokeWidth={2.8} />}
          iconBackground="var(--color-sunny)"
          shadow="coral"
        />
        <StatCard
          label="上传速度"
          value={
            latest ? (
              formatSpeedFixed(latest.up)
            ) : (
              <span aria-hidden className="block h-8 w-28 border-2 border-ink" />
            )
          }
          icon={<ArrowUp strokeWidth={2.8} />}
          iconBackground="var(--color-mint)"
          shadow="mint"
        />
        <StatCard
          label="活动连接"
          value={
            latest ? (
              String(latest.connections)
            ) : (
              <span aria-hidden className="block h-8 w-16 border-2 border-ink" />
            )
          }
          icon={<Link2 strokeWidth={2.6} />}
          iconBackground="var(--color-coral)"
          shadow="sunny"
        />
      </div>

      <div className="flex min-h-0 flex-1 gap-5">
        <Card shadow="coral" className="flex min-w-0 flex-1 flex-col gap-3 p-6">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-black tracking-[-0.2px]">流量统计</h2>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[11px] font-black">
                <i aria-hidden className="size-2.5 border-2 border-ink bg-coral" />
                下载
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-black">
                <i aria-hidden className="size-2.5 border-2 border-ink bg-mint" />
                上传
              </span>
            </div>
            <Segmented
              value={range}
              onChange={setRange}
              ariaLabel="统计窗口"
              options={RANGE_OPTIONS}
              className="ml-auto border-2 [&>button]:h-7 [&>button]:px-2.5 [&>button]:text-[10px]"
            />
          </div>

          {samples.length === 0 ? (
            <div
              className="flex flex-none items-center justify-center gap-2.5"
              style={{ height: 222 }}
            >
              {["w-[300px]", "w-[210px]", "w-[255px]"].map((width) => (
                <div key={width} aria-hidden className={cn("h-3.5 border-2 border-ink", width)} />
              ))}
            </div>
          ) : (
            <TrafficChart samples={samples} />
          )}

          <div className="flex justify-between text-[10px] font-bold">
            <span>-60s</span>
            <span>-40s</span>
            <span>-20s</span>
            <span>现在</span>
          </div>
        </Card>

        <div className="flex w-[340px] flex-none flex-col gap-5">
          <Card shadow="sunny" className="flex h-[162px] flex-none flex-col gap-3 p-5">
            <div className="flex items-center">
              <h2 className="text-[15px] font-black">代理模式</h2>
              <span className="ml-auto text-[10px] font-black tracking-[1px]">
                {status.mode.toUpperCase()}
              </span>
            </div>
            <Segmented
              value={status.mode}
              onChange={(mode) => void changeMode(mode)}
              ariaLabel="代理模式"
              options={[
                { value: "rule", label: "规则" },
                { value: "global", label: "全局" },
                { value: "direct", label: "直连" },
              ]}
              className="w-full [&>button]:flex-1"
            />
            <p className="text-[11px] font-bold leading-[15px]">{MODE_CAPTION[status.mode]}</p>
          </Card>

          <Card shadow="mint" className="flex h-[162px] flex-none flex-col gap-2 p-5">
            <div className="flex items-center">
              <h2 className="text-[15px] font-black">出口 IP</h2>
              <button
                type="button"
                aria-label="刷新出口信息"
                onClick={() => void refreshExit()}
                className="ml-auto flex size-6 cursor-pointer items-center justify-center border-2 border-ink bg-white transition-transform duration-300 hover:rotate-45"
              >
                <RefreshCw className="size-3" strokeWidth={2.8} />
              </button>
            </div>
            <div className="text-[23px] font-black leading-[28px] tracking-[-0.8px]">
              {status.exitIp || "—"}
            </div>
            {status.exitAsn ? (
              <div className="text-[10px] font-bold tracking-[0.3px]">{status.exitAsn}</div>
            ) : status.exitIp ? null : (
              <div className="text-[10px] font-bold tracking-[0.3px]">出口地区未获取</div>
            )}
            {status.exitRegion ? (
              <div className="mt-auto flex gap-2">
                <Tag tone="seafoam">{status.exitRegion}</Tag>
                {status.nativeIp ? <Tag tone="sunny">原生 IP</Tag> : null}
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}

interface HeroProps {
  status: Status;
  latest: TrafficSample | undefined;
  onToggle: () => void;
}

function Hero({ status, latest, onToggle }: HeroProps) {
  const connected = status.connected;

  return (
    <Card
      shadow="mint"
      shadowSize={8}
      className={cn(
        "flex h-[220px] flex-none -rotate-1 items-center justify-between gap-6 px-7",
        connected ? "bg-coral" : "bg-white",
      )}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center gap-2">
          {connected ? (
            <Tag tone="white" dot>
              已连接
            </Tag>
          ) : (
            <Tag
              tone="white"
              icon={<i aria-hidden className="size-2 border-2 border-ink bg-peach" />}
            >
              未连接
            </Tag>
          )}
          {status.systemProxy ? <Tag tone="ink">系统代理 ON</Tag> : null}
        </div>

        <div className="truncate text-[40px] font-black leading-[44px] tracking-[-1.4px]">
          {connected ? status.exitNode : "未连接"}
        </div>

        <div className="truncate text-sm font-bold">
          {connected
            ? `${MODE_LABEL[status.mode]}模式 · 延迟 ${formatLatency(status.exitLatency)} · 出口 ${status.exitIp || "—"}`
            : "系统代理已关闭 · 流量不再经过 GoClash"}
        </div>

        {connected && latest ? (
          <div className="mt-1 flex items-center gap-2.5">
            <SpeedChip direction="down" value={formatSpeedFixed(latest.down)} />
            <SpeedChip direction="up" value={formatSpeedFixed(latest.up)} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-none flex-col items-center gap-2.5">
        <Switch
          size="xl"
          label="系统代理"
          checked={status.systemProxy}
          onCheckedChange={onToggle}
        />
        <span className="text-xs font-black">系统代理</span>
      </div>
    </Card>
  );
}

function SpeedChip({ direction, value }: { direction: "down" | "up"; value: string }) {
  const Icon = direction === "down" ? ArrowDown : ArrowUp;
  return (
    <span className="inline-flex flex-none items-center gap-1.5 border-2 border-ink bg-white px-2.5 py-1 text-xs font-black leading-none">
      <Icon aria-hidden className="size-3.5" strokeWidth={3} />
      {value}
    </span>
  );
}

async function restartCore(gateway: Gateway, refresh: () => Promise<void>) {
  try {
    await gateway.restartCore();
  } finally {
    await refresh();
  }
}
