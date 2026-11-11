import { RefreshCw, Search, TriangleAlert, Waypoints } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/base/button";
import { Input } from "@/components/base/input";
import { AsyncPanel } from "@/components/base/state-panel";
import { Chip } from "@/components/base/tag";
import { DataTable, type DataTableColumn } from "@/components/base/table";
import type { Gateway, Rule } from "@/gateway/types";
import { cn } from "@/lib/utils";
import { HeaderActions } from "@/shell/header-actions";

type TypeFilter = "all" | "domain" | "cidr" | "geoip" | "ruleset";

const TYPE_LABEL: Record<TypeFilter, string> = {
  all: "全部",
  domain: "DOMAIN",
  cidr: "IP-CIDR",
  geoip: "GEOIP",
  ruleset: "RULE-SET",
};

const TYPE_ORDER: TypeFilter[] = ["all", "domain", "cidr", "geoip", "ruleset"];

function matchesType(rule: Rule, filter: TypeFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "domain":
      return rule.type.startsWith("DOMAIN");
    case "cidr":
      return rule.type === "IP-CIDR" || rule.type === "IP-CIDR6";
    case "geoip":
      return rule.type === "GEOIP";
    case "ruleset":
      return rule.type === "RULE-SET";
  }
}

export function RulesPage({ gateway }: { gateway: Gateway }) {
  const [all, setAll] = useState<Rule[] | null>(null);
  const [error, setError] = useState(false);
  const [type, setType] = useState<TypeFilter>("all");
  const [query, setQuery] = useState("");
  const [sortByHits, setSortByHits] = useState(true);
  const [reloading, setReloading] = useState(false);

  // The rule table is static between reloads — fetch once, refetch on demand.
  useEffect(() => {
    let cancelled = false;
    gateway.rules().then(
      (next) => {
        if (!cancelled) setAll(next);
      },
      () => {
        if (!cancelled) setError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [gateway]);

  async function reload() {
    setReloading(true);
    try {
      await gateway.reloadRules();
      setAll(await gateway.rules());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setReloading(false);
    }
  }

  if (error) {
    return (
      <AsyncPanel
        state="error"
        error={{
          icon: <TriangleAlert />,
          title: "读取规则失败",
          description: "内核没有应答规则集请求。更新一次规则通常能恢复。",
          actions: (
            <Button variant="ink" onClick={() => void reload()}>
              更新规则
            </Button>
          ),
        }}
      />
    );
  }

  if (!all) return <AsyncPanel state="loading" />;

  const counts: Record<TypeFilter, number> = {
    all: all.length,
    domain: all.filter((rule) => matchesType(rule, "domain")).length,
    cidr: all.filter((rule) => matchesType(rule, "cidr")).length,
    geoip: all.filter((rule) => matchesType(rule, "geoip")).length,
    ruleset: all.filter((rule) => matchesType(rule, "ruleset")).length,
  };

  const needle = query.trim().toLowerCase();
  const visible = all
    .filter(
      (rule) =>
        matchesType(rule, type) &&
        (!needle ||
          rule.payload.toLowerCase().includes(needle) ||
          rule.type.toLowerCase().includes(needle)),
    )
    .slice()
    .sort((a, b) => (sortByHits ? b.hits - a.hits : 0));

  const columns: DataTableColumn<Rule>[] = [
    {
      key: "type",
      header: "类型",
      width: 150,
      cell: (rule) => <span className="text-[9px] font-black tracking-[0.3px]">{rule.type}</span>,
    },
    {
      key: "payload",
      header: "规则内容",
      cell: (rule) => <span className="text-[11px] font-bold">{rule.payload}</span>,
    },
    {
      key: "policy",
      header: "匹配策略",
      width: 190,
      cell: (rule) => <PolicyPill policy={rule.policy} />,
    },
    {
      key: "hits",
      header: "命中次数",
      width: 100,
      align: "right",
      cell: (rule) => (
        <span className="text-[10px] font-black tabular-nums">{rule.hits.toLocaleString()}</span>
      ),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <HeaderActions>
        <Input
          icon={<Search className="size-3.5" strokeWidth={2.6} />}
          placeholder="搜索域名或 IP…"
          aria-label="搜索域名或 IP"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-[220px]"
        />
        <Button
          icon={<RefreshCw className="size-3.5" strokeWidth={2.6} />}
          onClick={() => void reload()}
          disabled={reloading}
        >
          {reloading ? "更新中…" : "更新规则"}
        </Button>
      </HeaderActions>

      <div className="flex h-12 flex-none items-center gap-2.5">
        {TYPE_ORDER.map((key) => (
          <Chip key={key} active={type === key} onClick={() => setType(key)}>
            {TYPE_LABEL[key]} {counts[key]}
          </Chip>
        ))}
        <span className="ml-auto text-[10px] font-black">规则自上而下匹配，命中即停</span>
        <Chip
          active={sortByHits}
          onClick={() => setSortByHits((value) => !value)}
          className={sortByHits ? "bg-sunny text-ink" : undefined}
        >
          按命中排序
        </Chip>
      </div>

      {visible.length === 0 ? (
        <AsyncPanel
          state="empty"
          empty={{
            icon: <Waypoints />,
            title: "没有匹配的规则",
            description: "换一个类型或清空搜索词再试。",
            action: (
              <Button
                variant="ghost"
                onClick={() => {
                  setType("all");
                  setQuery("");
                }}
              >
                清除筛选
              </Button>
            ),
          }}
        />
      ) : (
        <DataTable
          ariaLabel="规则列表"
          columns={columns}
          rows={visible}
          rowKey={(rule) => `${rule.type}:${rule.payload}`}
          rowClassName={(rule) => (rule.type === "MATCH" ? "border-ink bg-ink text-white" : "")}
          footer={
            <>
              <span>
                显示 {visible.length} / {all.length} 条 ·{" "}
                {sortByHits
                  ? "按命中排序仅影响显示，匹配仍按配置顺序自上而下"
                  : "规则自上而下匹配，命中即停"}
              </span>
              <span className="ml-auto">最后更新 3 小时前</span>
            </>
          }
        />
      )}
    </div>
  );
}

/**
 * Policy colour coding from the board: 节点选择 mint, DIRECT paper, REJECT coral.
 * Any other group name (自动选择…) falls to mint — those are proxy groups too.
 */
function PolicyPill({ policy }: { policy: string }) {
  const tone =
    policy === "REJECT"
      ? "bg-coral text-white"
      : policy === "DIRECT"
        ? "bg-white text-ink"
        : "bg-mint text-ink";
  return (
    <span
      className={cn(
        "inline-flex items-center border-2 border-ink px-2 py-0.5 text-[10px] font-black leading-none",
        tone,
      )}
    >
      {policy}
    </span>
  );
}
