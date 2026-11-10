import {
  Waypoints,
  Home,
  Globe,
  Layers,
  ArrowLeftRight,
  ScrollText,
  Settings,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button, IconButton } from "@/components/base/button";
import type { Gateway } from "@/gateway/types";
import { HomePage } from "@/pages/home";

export type PageId =
  "home" | "proxies" | "profiles" | "connections" | "rules" | "logs" | "settings";

/** Pages receive this from the shell; the only sanctioned way to switch pages. */
export type PageNavigate = (page: PageId) => void;

export interface PageDefinition {
  id: PageId;
  label: string;
  /** The one-line context under the title; also serves as the test hook. */
  sub: string;
  icon: ReactNode;
  /** Present once the page is implemented; missing = placeholder board. */
  render?: (gateway: Gateway, navigate: PageNavigate) => ReactNode;
  /** Rendered in the page header's right side, next to the title. */
  actions?: (gateway: Gateway, navigate: PageNavigate) => ReactNode;
}

/** Line icons at 18px / 2.5 stroke — the weight the boards use. */
const NAV_ICON = "size-[18px]";
const NAV_STROKE = 2.5;

export const PAGES: PageDefinition[] = [
  {
    id: "home",
    label: "首页",
    sub: "连接状态 · 实时流量 · 出口信息",
    icon: <Home className={NAV_ICON} strokeWidth={NAV_STROKE} />,
    render: (gateway, navigate) => <HomePage gateway={gateway} navigate={navigate} />,
    actions: (gateway, navigate) => (
      <>
        <IconButton size="md" aria-label="打开设置" onClick={() => navigate("settings")}>
          <Settings className="size-4" strokeWidth={2.5} />
        </IconButton>
        <Button
          icon={<Zap className="size-3.5" strokeWidth={2.5} />}
          onClick={() => void gateway.testAllGroups()}
        >
          立即测速
        </Button>
      </>
    ),
  },
  {
    id: "proxies",
    label: "代理",
    sub: "8 个策略组 · 126 个节点 · 延迟检测 300s",
    icon: <Globe className={NAV_ICON} strokeWidth={NAV_STROKE} />,
  },
  {
    id: "profiles",
    label: "订阅",
    sub: "2 个远程配置 · 1 个本地配置 · 自动更新每 12 小时",
    icon: <Layers className={NAV_ICON} strokeWidth={NAV_STROKE} />,
  },
  {
    id: "connections",
    label: "连接",
    sub: "42 条活动连接 · 进程嗅探开启",
    icon: <ArrowLeftRight className={NAV_ICON} strokeWidth={NAV_STROKE} />,
  },
  {
    id: "rules",
    label: "规则",
    sub: "1284 条规则 · 12 个规则集 · 最后更新 3 小时前",
    icon: <Waypoints className={NAV_ICON} strokeWidth={NAV_STROKE} />,
  },
  {
    id: "logs",
    label: "日志",
    sub: "实时输出 · 缓冲区 512 条 · 等级 info 及以上",
    icon: <ScrollText className={NAV_ICON} strokeWidth={NAV_STROKE} />,
  },
  {
    id: "settings",
    label: "设置",
    sub: "GoClash 3.0.0 · mihomo 1.19.4 · 服务模式运行中",
    icon: <Settings className={NAV_ICON} strokeWidth={NAV_STROKE} />,
  },
];
