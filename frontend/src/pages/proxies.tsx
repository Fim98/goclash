import { ArrowRight, Globe, Link2, RefreshCw, Search, TriangleAlert, Zap } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { Button, IconButton } from "@/components/base/button";
import { Card } from "@/components/base/card";
import { Input } from "@/components/base/input";
import { Segmented } from "@/components/base/segmented";
import { AsyncPanel } from "@/components/base/state-panel";
import { Switch } from "@/components/base/switch";
import { Tag } from "@/components/base/tag";
import type { Gateway, Profile, ProxyGroup, ProxyMode, ProxyNode, Rule } from "@/gateway/types";
import { formatBytes, formatLatency, latencyTone, type LatencyTone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HeaderActions } from "@/shell/header-actions";
import { useAppStatus } from "@/shell/status-context";
import type { PageNavigate } from "@/shell/pages";

type SortMode = "latency" | "name";

interface ProxiesData {
  groups: ProxyGroup[];
  profiles: Profile[];
  rules: Rule[];
  chained: boolean;
}

const LATENCY_TONE: Record<LatencyTone, string> = {
  mint: "bg-mint text-ink",
  sunny: "bg-sunny text-ink",
  peach: "bg-peach text-ink",
  none: "bg-white text-ink",
};

export function ProxiesPage({ gateway, navigate }: { gateway: Gateway; navigate: PageNavigate }) {
  const { status, setStatus, refresh: refreshStatus } = useAppStatus();
  const [data, setData] = useState<ProxiesData | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("latency");
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([gateway.groups(), gateway.profiles(), gateway.rules(), gateway.settings()]).then(
      ([groups, profiles, rules, settings]) => {
        if (!cancelled) setData({ groups, profiles, rules, chained: settings.chainedProxy });
      },
      () => {
        if (!cancelled) setError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [gateway]);

  const refresh = useCallback(async () => {
    const [groups, profiles] = await Promise.all([gateway.groups(), gateway.profiles()]);
    setData((previous) => (previous ? { ...previous, groups, profiles } : previous));
    setError(false);
  }, [gateway]);

  const retry = useCallback(async () => {
    try {
      await refresh();
    } catch {
      setError(true);
    }
  }, [refresh]);

  async function pick(groupId: string, nodeName: string) {
    setData((previous) =>
      previous
        ? {
            ...previous,
            groups: previous.groups.map((group) =>
              group.id === groupId ? { ...group, selected: nodeName } : group,
            ),
          }
        : previous,
    );
    try {
      await gateway.select(groupId, nodeName);
    } finally {
      await Promise.all([refresh(), refreshStatus()]);
    }
  }

  async function testOne(groupId: string) {
    setTesting(groupId);
    try {
      await gateway.testGroup(groupId);
      await refresh();
    } finally {
      setTesting(null);
    }
  }

  async function testAll() {
    setTesting("all");
    try {
      await gateway.testAllGroups();
      await Promise.all([refresh(), refreshStatus()]);
    } finally {
      setTesting(null);
    }
  }

  async function updateProvider(id: string) {
    await gateway.refreshProfile(id);
    await refresh();
  }

  async function updateAllProviders(profiles: Profile[]) {
    await Promise.all(profiles.map((profile) => gateway.refreshProfile(profile.id)));
    await refresh();
  }

  async function toggleChained(next: boolean) {
    setData((previous) => (previous ? { ...previous, chained: next } : previous));
    await gateway.updateSettings({ chainedProxy: next });
  }

  async function changeMode(mode: ProxyMode) {
    if (!status || mode === status.mode) return;
    setStatus({ ...status, mode });
    try {
      await gateway.setMode(mode);
    } finally {
      await refreshStatus();
    }
  }

  if (error) {
    return (
      <AsyncPanel
        state="error"
        error={{
          icon: <TriangleAlert />,
          title: "读取代理失败",
          description: "内核没有应答策略组请求。重试一次；若持续失败请查看日志。",
          actions: (
            <Button variant="ink" onClick={() => void retry()}>
              重试
            </Button>
          ),
        }}
      />
    );
  }

  if (!data || !status) return <AsyncPanel state="loading" />;

  const { groups, profiles, rules, chained } = data;

  // No subscription means no strategy groups to show — send the user to the
  // page that creates one.
  if (groups.length === 0 || profiles.length === 0) {
    return (
      <AsyncPanel
        state="empty"
        empty={{
          icon: <Globe />,
          title: "还没有订阅",
          description: "策略组与节点来自订阅。去订阅页粘贴一个链接，载入后这里就会出现。",
          action: <Button onClick={() => navigate("profiles")}>去订阅页</Button>,
        }}
      />
    );
  }

  const needle = query.trim().toLowerCase();
  const current = profiles.find((profile) => profile.current) ?? profiles[0];
  const topRules = rules
    .slice()
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 3);
  const busy = testing !== null;

  function visibleNodes(group: ProxyGroup): ProxyNode[] {
    return group.nodes
      .filter((node) => !needle || node.name.toLowerCase().includes(needle))
      .slice()
      .sort((a, b) =>
        sort === "name"
          ? a.name.localeCompare(b.name, "zh")
          : (a.latency ?? Number.MAX_SAFE_INTEGER) - (b.latency ?? Number.MAX_SAFE_INTEGER),
      );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <HeaderActions>
        <Input
          icon={<Search className="size-3.5" strokeWidth={2.6} />}
          placeholder="搜索节点…"
          aria-label="搜索节点"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-[220px]"
        />
        <Button
          icon={<Zap className="size-3.5" strokeWidth={2.5} />}
          onClick={() => void testAll()}
          disabled={busy}
        >
          {testing === "all" ? "测速中…" : "全部测速"}
        </Button>
      </HeaderActions>

      <div className="flex h-12 flex-none items-center gap-2.5">
        <Segmented
          value={status.mode}
          onChange={(mode) => void changeMode(mode)}
          ariaLabel="代理模式"
          options={[
            { value: "rule", label: "规则" },
            { value: "global", label: "全局" },
            { value: "direct", label: "直连" },
          ]}
        />
        <span className="ml-auto flex items-center gap-2">
          <span className="text-[10px] font-black">排序</span>
          <SortChip active={sort === "latency"} onClick={() => setSort("latency")}>
            延迟
          </SortChip>
          <SortChip active={sort === "name"} onClick={() => setSort("name")}>
            名称
          </SortChip>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 gap-5">
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-2 pb-2">
          {groups.map((group, index) => {
            const nodes = visibleNodes(group);
            return (
              <Card
                key={group.id}
                shadow={index % 2 === 0 ? "mint" : "coral"}
                className="flex flex-none flex-col gap-3.5 p-5"
              >
                <div className="flex items-center gap-2.5">
                  <StrategyIcon strategy={group.strategy} />
                  <h2 className="text-lg font-black tracking-[-0.3px]">{group.name}</h2>
                  <Tag tone="sunny" className="px-2 py-0.5 text-[10px]">
                    {group.strategy}
                  </Tag>
                  <span className="ml-auto text-[11px] font-bold tabular-nums">
                    {nodes.length} / {group.nodes.length}
                  </span>
                  <IconButton
                    size="xs"
                    aria-label={`测速 ${group.name}`}
                    disabled={busy}
                    onClick={() => void testOne(group.id)}
                  >
                    <RefreshCw
                      className={cn("size-3", testing === group.id && "animate-spin")}
                      strokeWidth={2.8}
                    />
                  </IconButton>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {nodes.map((node) => (
                    <NodeTile
                      key={node.name}
                      node={node}
                      selected={group.selected === node.name}
                      onSelect={() => void pick(group.id, node.name)}
                    />
                  ))}
                  {nodes.length === 0 ? (
                    <p className="col-span-2 text-[11px] font-bold">无匹配节点</p>
                  ) : null}
                </div>
              </Card>
            );
          })}

          <Card shadow="sunny" className="flex flex-none flex-col gap-3 p-5">
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-black">最近命中</h2>
              <span className="text-[8px] font-black tracking-[0.8px]">RULE · LIVE</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {topRules.map((rule) => (
                <div
                  key={`${rule.type}:${rule.payload}`}
                  className="border-2 border-ink px-2.5 py-2"
                >
                  <div className="truncate text-[9px] font-black">
                    {rule.type},{rule.payload}
                  </div>
                  <div className="mt-1 truncate text-[9px] font-bold">命中 · {rule.policy}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="flex w-[340px] flex-none flex-col gap-5">
          <Card
            shadow="mint"
            shadowSize={8}
            className="flex h-[152px] flex-none -rotate-1 flex-col gap-2 bg-coral p-5"
          >
            <Tag tone="white" className="self-start">
              当前出口
            </Tag>
            <div className="truncate text-[26px] font-black leading-[1.15] tracking-[-0.8px]">
              {status.exitNode}
            </div>
            <div className="text-[11px] font-black">
              {formatLatency(status.exitLatency)} · {status.exitIp || "—"}
            </div>
          </Card>

          <Card shadow="sunny" className="flex h-[176px] flex-none flex-col gap-3 p-5">
            <div className="flex items-center">
              <h2 className="text-[15px] font-black">代理提供者</h2>
              <button
                type="button"
                onClick={() => void updateAllProviders(profiles)}
                className="ml-auto cursor-pointer text-[10px] font-black"
              >
                全部更新
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {profiles.map((profile) => (
                <div key={profile.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-black">{profile.name}</div>
                    <div className="mt-0.5 truncate text-[9px] font-bold">
                      {profile.nodeCount} 节点 · {profile.updatedAt}更新
                    </div>
                  </div>
                  <IconButton
                    size="xs"
                    aria-label={`更新 ${profile.name}`}
                    className={profile.current ? "bg-sunny" : undefined}
                    onClick={() => void updateProvider(profile.id)}
                  >
                    <RefreshCw className="size-2.5" strokeWidth={3.2} />
                  </IconButton>
                </div>
              ))}
            </div>
          </Card>

          <QuotaCard profile={current} />

          <Card className="flex h-[92px] flex-none items-center justify-between gap-3 p-5">
            <div className="min-w-0">
              <h2 className="text-[15px] font-black">链式代理</h2>
              <p className="mt-0.5 text-[10px] font-bold">双跳加密 · 速度会明显下降</p>
            </div>
            <Switch
              size="sm"
              label="链式代理"
              checked={chained}
              onCheckedChange={(next) => void toggleChained(next)}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

function NodeTile({
  node,
  selected,
  onSelect,
}: {
  node: ProxyNode;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex h-[46px] w-full items-center justify-between gap-2 px-3 text-left",
        selected
          ? "border-4 border-ink bg-coral text-white shadow-[4px_4px_0_var(--color-sunny)]"
          : "border-[3px] border-ink bg-white text-ink transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:bg-sunny",
      )}
    >
      <span className="truncate text-[13px] font-bold">{node.name}</span>
      <span
        className={cn(
          "flex-none border-2 border-ink px-1.5 py-0.5 text-[10px] font-black leading-none tabular-nums",
          selected ? "bg-white text-ink" : LATENCY_TONE[latencyTone(node.latency)],
        )}
      >
        {formatLatency(node.latency)}
      </span>
    </button>
  );
}

function SortChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-8 cursor-pointer border-2 border-ink px-3 text-[11px] font-black transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5",
        active ? "bg-sunny text-ink" : "bg-white text-ink",
      )}
    >
      {children}
    </button>
  );
}

function StrategyIcon({ strategy }: { strategy: ProxyGroup["strategy"] }) {
  const Icon = strategy === "select" ? Link2 : strategy === "relay" ? ArrowRight : Zap;
  return <Icon aria-hidden className="size-[22px] flex-none" strokeWidth={2.2} />;
}

function QuotaCard({ profile }: { profile: Profile | undefined }) {
  const percent =
    profile && profile.totalBytes > 0
      ? Math.min(100, Math.round((profile.usedBytes / profile.totalBytes) * 100))
      : 0;

  return (
    <Card shadow="seafoam" className="flex h-[152px] flex-none flex-col gap-2 p-5">
      <div className="flex items-center">
        <h2 className="text-[15px] font-black">订阅流量</h2>
      </div>
      <div className="text-[11px] font-black tabular-nums">
        {profile ? `${formatBytes(profile.usedBytes)} / ${formatBytes(profile.totalBytes)}` : "—"}
      </div>
      <div className="flex h-3.5 w-full items-center border-2 border-ink bg-white p-0.5">
        <div className="h-full bg-coral" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-[10px] font-bold">
        {profile ? `已用 ${percent}% · ${profile.expiresAt} 到期` : "还没有订阅流量数据"}
      </p>
    </Card>
  );
}
