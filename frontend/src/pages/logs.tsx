import { FolderOpen, ScrollText } from "lucide-react";
import { useEffect, useRef, useState, type UIEvent } from "react";

import { Button } from "@/components/base/button";
import { AsyncPanel } from "@/components/base/state-panel";
import { Switch } from "@/components/base/switch";
import { Chip } from "@/components/base/tag";
import { DataTable, type DataTableColumn } from "@/components/base/table";
import type { Gateway, LogLevel, LogLine } from "@/gateway/types";
import { cn } from "@/lib/utils";
import { HeaderActions } from "@/shell/header-actions";

/** Ring buffer size; the oldest line is dropped once it fills up. */
const LOG_WINDOW = 512;

type LevelFilter = "all" | LogLevel;

const LEVEL_ORDER: LevelFilter[] = ["all", "debug", "info", "warn", "error"];

const LEVEL_LABEL: Record<LevelFilter, string> = {
  all: "全部",
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
};

const LEVEL_STYLE: Record<LogLevel, string> = {
  info: "bg-mint text-on-accent",
  debug: "bg-surface text-ink",
  warn: "bg-sunny text-on-accent",
  error: "bg-coral text-white",
};

export function LogsPage({ gateway }: { gateway: Gateway }) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [ready, setReady] = useState(false);
  const [level, setLevel] = useState<LevelFilter>("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const [pinned, setPinned] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = gateway.subscribe("log", (event) => {
      if (!("message" in event)) return;
      setLines((previous) => {
        const next = [...previous, event];
        return next.length > LOG_WINDOW ? next.slice(-LOG_WINDOW) : next;
      });
    });
    // The buffer replays synchronously on attach; flip ready on the next
    // microtask so the first frame is the console, not a skeleton flash.
    Promise.resolve().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [gateway]);

  // Auto-scroll only while the user is pinned to the bottom — scrolling up to
  // read must never be yanked back by an incoming line.
  useEffect(() => {
    if (!autoScroll || !pinned) return;
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines, level, autoScroll, pinned]);

  function trackScroll(event: UIEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    setPinned(element.scrollHeight - element.scrollTop - element.clientHeight < 8);
  }

  async function clear() {
    await gateway.clearLogs();
    setLines([]);
  }

  if (!ready) return <AsyncPanel state="loading" />;

  const counts: Record<LevelFilter, number> = {
    all: lines.length,
    debug: lines.filter((line) => line.level === "debug").length,
    info: lines.filter((line) => line.level === "info").length,
    warn: lines.filter((line) => line.level === "warn").length,
    error: lines.filter((line) => line.level === "error").length,
  };

  const visible = lines.filter((line) => level === "all" || line.level === level);
  const last = lines.length > 0 ? lines[lines.length - 1] : null;

  const columns: DataTableColumn<LogLine>[] = [
    {
      key: "time",
      header: "时间",
      width: 110,
      cell: (line) => <span className="text-[10px] font-bold tabular-nums">{line.time}</span>,
    },
    {
      key: "level",
      header: "等级",
      width: 90,
      cell: (line) => <LevelTag level={line.level} />,
    },
    {
      key: "message",
      header: "输出",
      cell: (line) => <span className="text-[10px] font-bold">{line.message}</span>,
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <HeaderActions>
        <Button variant="ghost" onClick={() => void clear()}>
          清空
        </Button>
        <Button
          icon={<FolderOpen className="size-3.5" strokeWidth={2.5} />}
          onClick={() => void gateway.openLogDirectory()}
        >
          日志目录
        </Button>
      </HeaderActions>

      <div className="flex h-12 flex-none items-center gap-2.5">
        {LEVEL_ORDER.map((key) => (
          <Chip key={key} active={level === key} onClick={() => setLevel(key)}>
            {LEVEL_LABEL[key]} {counts[key]}
          </Chip>
        ))}
        <span className="ml-auto text-[10px] font-black">自动滚动</span>
        <Switch size="sm" label="自动滚动" checked={autoScroll} onCheckedChange={setAutoScroll} />
      </div>

      {visible.length === 0 ? (
        <AsyncPanel
          state="empty"
          empty={{
            icon: <ScrollText />,
            title: lines.length === 0 ? "还没有日志输出" : "该等级下暂无输出",
            description:
              lines.length === 0
                ? "连接活动、DNS 查询与规则命中会实时写到这里。"
                : "换一个等级，或清除筛选查看全部输出。",
            action:
              lines.length === 0 ? (
                <Button variant="ghost" onClick={() => void gateway.openLogDirectory()}>
                  打开日志目录
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setLevel("all")}>
                  查看全部
                </Button>
              ),
          }}
        />
      ) : (
        <DataTable
          ariaLabel="日志输出"
          columns={columns}
          rows={visible}
          rowKey={(line, index) => `${line.time}-${index}`}
          rowHeight={53}
          scrollRef={scrollRef}
          onScroll={trackScroll}
          footer={
            <>
              <span>
                {autoScroll ? "自动滚动已开启" : "自动滚动已暂停"} · 缓冲区 {lines.length} 条 ·{" "}
                {level === "all" ? "显示全部等级" : `仅显示 ${level}`}
              </span>
              <span className="ml-auto tabular-nums">最后一条 {last ? last.time : "—"}</span>
            </>
          }
        />
      )}
    </div>
  );
}

function LevelTag({ level }: { level: LogLevel }) {
  return (
    <span
      className={cn(
        "inline-flex items-center border-2 border-ink px-1.5 py-0.5 text-[8px] font-black leading-none tracking-[0.4px]",
        LEVEL_STYLE[level],
      )}
    >
      {level.toUpperCase()}
    </span>
  );
}
