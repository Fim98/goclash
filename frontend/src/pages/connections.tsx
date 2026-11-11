import { Link2, Search, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button, IconButton } from "@/components/base/button";
import { Input } from "@/components/base/input";
import { AsyncPanel } from "@/components/base/state-panel";
import { Switch } from "@/components/base/switch";
import { Chip } from "@/components/base/tag";
import { DataTable, type DataTableColumn } from "@/components/base/table";
import type { Connection, Gateway } from "@/gateway/types";
import { formatDuration, formatTraffic } from "@/lib/format";
import { HeaderActions } from "@/shell/header-actions";
import { useT, type MessageKey } from "@/lib/i18n";

type KindFilter = "all" | Connection["kind"];

const KIND_LABEL: Record<KindFilter, MessageKey> = {
  all: "全部",
  proxy: "代理",
  direct: "直连",
  reject: "拦截",
};

const KIND_ORDER: KindFilter[] = ["all", "proxy", "direct", "reject"];

export function ConnectionsPage({ gateway }: { gateway: Gateway }) {
  const t = useT();
  const [rows, setRows] = useState<Connection[] | null>(null);
  const [error, setError] = useState(false);
  const [kind, setKind] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [closed, setClosed] = useState(0);

  // Mount fetch plus 1 Hz polling while auto refresh is on. The callback form
  // keeps setState out of the effect body (react-hooks rule).
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      gateway.connections().then(
        (next) => {
          if (cancelled) return;
          setRows(next);
          setError(false);
        },
        () => {
          if (!cancelled) setError(true);
        },
      );
    };
    tick();
    if (!autoRefresh) {
      return () => {
        cancelled = true;
      };
    }
    const timer = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [gateway, autoRefresh]);

  const refresh = useCallback(async () => {
    try {
      setRows(await gateway.connections());
      setError(false);
    } catch {
      setError(true);
    }
  }, [gateway]);

  async function closeOne(id: string) {
    try {
      await gateway.closeConnection(id);
    } finally {
      setClosed((count) => count + 1);
      await refresh();
    }
  }

  async function closeAll() {
    const removed = rows?.length ?? 0;
    try {
      await gateway.closeAllConnections();
    } finally {
      setClosed((count) => count + removed);
      await refresh();
    }
  }

  if (error) {
    return (
      <AsyncPanel
        state="error"
        error={{
          icon: <TriangleAlert />,
          title: "读取连接失败",
          description: "内核没有应答连接列表请求。稍后重试；若持续失败请查看日志。",
          actions: (
            <Button variant="ink" onClick={() => void refresh()}>
              {t("重试")}
            </Button>
          ),
        }}
      />
    );
  }

  if (!rows) return <AsyncPanel state="loading" />;

  const counts: Record<KindFilter, number> = {
    all: rows.length,
    proxy: rows.filter((row) => row.kind === "proxy").length,
    direct: rows.filter((row) => row.kind === "direct").length,
    reject: rows.filter((row) => row.kind === "reject").length,
  };

  const needle = query.trim().toLowerCase();
  const visible = rows.filter(
    (row) =>
      (kind === "all" || row.kind === kind) &&
      (!needle ||
        row.host.toLowerCase().includes(needle) ||
        row.rule.toLowerCase().includes(needle)),
  );

  // The connection moving the most bytes right now — "谁在偷跑流量".
  const hot = rows.reduce<Connection | null>(
    (max, row) => (max === null || row.downloadBytes > max.downloadBytes ? row : max),
    null,
  );

  const columns: DataTableColumn<Connection>[] = [
    {
      key: "host",
      header: "主机 / HOST",
      cell: (row) => <span className="text-[11px] font-bold">{row.host}</span>,
    },
    {
      key: "rule",
      header: "命中规则",
      width: 190,
      cell: (row) => <span className="text-[10px] font-bold">{row.rule}</span>,
    },
    {
      key: "exit",
      header: "出口节点",
      width: 180,
      cell: (row) => <span className="text-[11px] font-bold">{row.exit}</span>,
    },
    {
      key: "traffic",
      header: "上下行",
      width: 140,
      cell: (row) => (
        <span className="text-[10px] font-bold tabular-nums">
          {formatTraffic(row.uploadBytes)} / {formatTraffic(row.downloadBytes)}
        </span>
      ),
    },
    {
      key: "duration",
      header: "时长",
      width: 70,
      cell: (row) => (
        <span className="text-[10px] font-bold tabular-nums">
          {formatDuration(row.durationSeconds)}
        </span>
      ),
    },
    {
      key: "close",
      header: "",
      width: 30,
      cell: (row) => (
        <IconButton
          size="xs"
          aria-label={t("关闭 {host}", { host: row.host })}
          onClick={() => void closeOne(row.id)}
        >
          <X className="size-3" strokeWidth={3} />
        </IconButton>
      ),
    },
  ];

  const nothingYet = rows.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <HeaderActions>
        <Input
          icon={<Search className="size-3.5" strokeWidth={2.6} />}
          placeholder={t("搜索主机或规则…")}
          aria-label={t("搜索主机或规则")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-[220px]"
        />
        <Button onClick={() => void closeAll()}>{t("全部关闭")}</Button>
      </HeaderActions>

      <div className="flex h-12 flex-none items-center gap-2.5">
        {KIND_ORDER.map((key) => (
          <Chip key={key} active={kind === key} onClick={() => setKind(key)}>
            {t(KIND_LABEL[key])} {counts[key]}
          </Chip>
        ))}
        <span className="ml-auto text-[10px] font-black">{t("自动刷新 1s")}</span>
        <Switch
          size="sm"
          label={t("自动刷新")}
          checked={autoRefresh}
          onCheckedChange={setAutoRefresh}
        />
      </div>

      {visible.length === 0 ? (
        <AsyncPanel
          state="empty"
          empty={{
            icon: <Link2 />,
            title: nothingYet ? t("当前没有活动连接") : t("该筛选下没有连接"),
            description: nothingYet
              ? t("发出请求后，这里会实时列出每条连接、命中的规则与出口节点。")
              : t("换一个类型或清空搜索词再试。"),
            action: nothingYet ? (
              <Button variant="ghost" onClick={() => void refresh()}>
                {t("刷新")}
              </Button>
            ) : (
              <Button
                variant="ghost"
                onClick={() => {
                  setKind("all");
                  setQuery("");
                }}
              >
                {t("清除筛选")}
              </Button>
            ),
          }}
        />
      ) : (
        <DataTable
          ariaLabel={t("活动连接")}
          columns={columns}
          rows={visible}
          rowKey={(row) => row.id}
          rowClassName={(row) => (row.id === hot?.id ? "bg-sunny" : "")}
          footer={
            <>
              <span>
                {t("显示 {shown} / {total} 条 · 超过 1 分钟未活动的连接自动隐藏", {
                  shown: visible.length,
                  total: rows.length,
                })}
              </span>
              <span className="ml-auto">{t("已关闭 {count} 条", { count: closed })}</span>
            </>
          }
        />
      )}
    </div>
  );
}
