import { Layers } from "lucide-react";
import { useCallback, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

import { Button } from "@/components/base/button";
import { Card } from "@/components/base/card";
import { Input } from "@/components/base/input";
import { Segmented } from "@/components/base/segmented";
import { AsyncPanel } from "@/components/base/state-panel";
import { Switch } from "@/components/base/switch";
import { Tag } from "@/components/base/tag";
import type { Gateway, Profile, Settings } from "@/gateway/types";
import { formatBytes } from "@/lib/format";
import { HeaderActions } from "@/shell/header-actions";

export function ProfilesPage({ gateway }: { gateway: Gateway }) {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([gateway.profiles(), gateway.settings()]).then(
      ([nextProfiles, nextSettings]) => {
        if (cancelled) return;
        setProfiles(nextProfiles);
        setSettings(nextSettings);
      },
      () => {
        if (!cancelled) setError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [gateway]);

  // A scheduled refresh pushes a fresh list; repaint without polling.
  useEffect(
    () =>
      gateway.onProfilesChanged(() => {
        gateway.profiles().then(setProfiles, () => {});
      }),
    [gateway],
  );

  const refresh = useCallback(async () => {
    setProfiles(await gateway.profiles());
    setError(false);
  }, [gateway]);

  async function patchSettings(patch: Partial<Settings>) {
    setSettings((previous) => (previous ? { ...previous, ...patch } : previous));
    try {
      await gateway.updateSettings(patch);
    } catch {
      // Keep the control honest: show whatever the gateway actually stored.
      try {
        setSettings(await gateway.settings());
      } catch {
        // Leave the optimistic value; reopening the page re-reads it.
      }
    }
  }

  async function remove(id: string) {
    await gateway.removeProfile(id);
    await refresh();
  }

  async function update(id: string) {
    await gateway.refreshProfile(id);
    await refresh();
  }

  async function submit() {
    if (!url.trim()) return;
    await gateway.addProfile(url.trim());
    setAdding(false);
    setUrl("");
    await refresh();
  }

  async function importFromClipboard() {
    let text: string;
    try {
      text = (await navigator.clipboard?.readText?.()) ?? "";
    } catch {
      text = "";
    }
    if (text) setUrl(text);
    setAdding(true);
  }

  if (error) {
    return (
      <AsyncPanel
        state="error"
        error={{
          icon: <Layers />,
          title: "读取订阅失败",
          description: "内核没有应答订阅列表请求。重试一次；若持续失败请查看日志。",
          actions: (
            <Button variant="ink" onClick={() => void refresh()}>
              重试
            </Button>
          ),
        }}
      />
    );
  }

  if (!profiles || !settings) return <AsyncPanel state="loading" />;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <HeaderActions>
        <Button variant="ghost" onClick={() => void importFromClipboard()}>
          从剪贴板导入
        </Button>
        <Button onClick={() => setAdding(true)}>新建订阅</Button>
      </HeaderActions>

      {profiles.length === 0 && !adding ? (
        <AsyncPanel
          state="empty"
          empty={{
            icon: <Layers />,
            title: "还没有订阅",
            description: "粘贴一个订阅链接，载入后节点与策略组会出现在代理页。",
            action: (
              <Button variant="ink" onClick={() => setAdding(true)}>
                导入订阅
              </Button>
            ),
          }}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-2 pb-2">
          {adding ? (
            <Card shadow="mint" className="flex h-[72px] flex-none items-center gap-3 px-5">
              <Input
                autoFocus
                aria-label="订阅链接"
                placeholder="https://sub.example.com/api/v1/client/subscribe?token=…"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                className="flex-1"
              />
              <Button disabled={!url.trim()} onClick={() => void submit()}>
                添加
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setAdding(false);
                  setUrl("");
                }}
              >
                取消
              </Button>
            </Card>
          ) : null}

          {profiles.length > 0 ? (
            <div className="grid flex-none grid-cols-2 gap-5">
              {profiles.map((profile) => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  onUpdate={() => void update(profile.id)}
                  onDelete={() => void remove(profile.id)}
                />
              ))}
            </div>
          ) : null}

          {profiles.length > 0 ? <LocalConfigCard /> : null}

          {profiles.length > 0 ? (
            <AutoUpdateCard settings={settings} onPatch={(patch) => void patchSettings(patch)} />
          ) : null}
        </div>
      )}
    </div>
  );
}

function ProfileCard({
  profile,
  onUpdate,
  onDelete,
}: {
  profile: Profile;
  onUpdate: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const percent =
    profile.totalBytes > 0
      ? Math.min(100, Math.round((profile.usedBytes / profile.totalBytes) * 100))
      : 0;

  return (
    <Card
      shadow={profile.current ? "mint" : "sunny"}
      className="flex h-[260px] flex-none flex-col gap-3 p-6"
    >
      <div className="flex items-center gap-2.5">
        <h2 className="truncate text-xl font-black tracking-[-0.5px]">{profile.name}</h2>
        {profile.current ? <Tag tone="coral">当前使用</Tag> : null}
      </div>

      <div className="truncate text-[9px] font-bold">{profile.url}</div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline">
          <span className="text-[10px] font-black">已用流量</span>
          <span className="ml-auto text-[11px] font-black tabular-nums">
            {formatBytes(profile.usedBytes)} / {formatBytes(profile.totalBytes)}
          </span>
        </div>
        <div className="flex h-3.5 items-center border-2 border-ink bg-white p-0.5">
          <div className="h-full bg-coral" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Meta label="节点数" value={String(profile.nodeCount)} />
        <Meta label="到期" value={profile.expiresAt} />
        <Meta label="上次更新" value={profile.updatedAt} />
      </div>

      <div className="mt-auto flex items-center gap-2">
        {confirming ? (
          <>
            <span className="text-[10px] font-bold">删除后需用链接重新导入</span>
            <div className="ml-auto flex gap-2">
              <SmallButton
                tone="coral"
                onClick={() => {
                  setConfirming(false);
                  onDelete();
                }}
              >
                确认删除
              </SmallButton>
              <SmallButton onClick={() => setConfirming(false)}>取消</SmallButton>
            </div>
          </>
        ) : (
          <>
            <SmallButton tone="coral" onClick={onUpdate}>
              立即更新
            </SmallButton>
            <SmallButton
              disabled
              title="v1 暂未接入 YAML 编辑器"
              aria-label={`编辑 ${profile.name}`}
            >
              编辑配置
            </SmallButton>
            <SmallButton
              className="ml-auto border-coral"
              aria-label={`删除 ${profile.name}`}
              onClick={() => setConfirming(true)}
            >
              删除
            </SmallButton>
          </>
        )}
      </div>
    </Card>
  );
}

function LocalConfigCard() {
  return (
    <Card shadow="sunny" className="flex h-[186px] flex-none flex-col gap-2.5 p-5">
      <div className="flex items-center gap-2.5">
        <h2 className="text-base font-black">本地配置 · config.yaml</h2>
        <Tag tone="mint">已合并</Tag>
        <SmallButton
          disabled
          title="v1 暂未接入 YAML 编辑器"
          className="ml-auto h-8 px-3"
          aria-label="编辑 YAML"
        >
          编辑 YAML
        </SmallButton>
      </div>
      <p className="text-[11px] font-bold">
        通过 Merge 与 Script 覆写远程订阅，订阅更新时不会被覆盖
      </p>
      <div className="grid grid-cols-3 gap-3">
        <Patch kind="MERGE" text="覆写 42 条规则" />
        <Patch kind="SCRIPT" text="混合端口改为 7891" />
        <Patch kind="OVERRIDE" text="日志等级 info" />
      </div>
      <p className="mt-auto text-[10px] font-bold">
        规则覆写 42 条 · 端口覆写 7891 · 最后编辑 昨天 14:02
      </p>
    </Card>
  );
}

function AutoUpdateCard({
  settings,
  onPatch,
}: {
  settings: Settings;
  onPatch: (patch: Partial<Settings>) => void;
}) {
  return (
    <Card shadow="seafoam" className="flex h-[218px] flex-none flex-col gap-1 p-5">
      <div className="flex flex-none items-center">
        <h2 className="text-base font-black">自动更新</h2>
        <Switch
          className="ml-auto"
          size="sm"
          label="自动更新"
          checked={settings.autoUpdateEnabled}
          onCheckedChange={(next) => onPatch({ autoUpdateEnabled: next })}
        />
      </div>

      <SettingRow label="更新间隔">
        <Segmented
          value={String(settings.autoUpdateIntervalHours)}
          onChange={(value) => onPatch({ autoUpdateIntervalHours: Number(value) as 6 | 12 | 24 })}
          ariaLabel="更新间隔"
          options={[
            { value: "6", label: "6h" },
            { value: "12", label: "12h" },
            { value: "24", label: "24h" },
          ]}
          className="border-2 [&>button]:h-7 [&>button]:px-3 [&>button]:text-[10px]"
        />
      </SettingRow>

      <SettingRow label="更新后自动切到延迟最低节点">
        <Switch
          size="sm"
          label="更新后自动切到延迟最低节点"
          checked={settings.autoSwitchLowestLatency}
          onCheckedChange={(next) => onPatch({ autoSwitchLowestLatency: next })}
        />
      </SettingRow>

      <SettingRow label="通过代理下载订阅地址">
        <Switch
          size="sm"
          label="通过代理下载订阅地址"
          checked={settings.proxyDownload}
          onCheckedChange={(next) => onPatch({ proxyDownload: next })}
        />
      </SettingRow>
    </Card>
  );
}

function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-between gap-3">
      <span className="text-[11px] font-black">{label}</span>
      {children}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-bold">{label}</div>
      <div className="mt-0.5 truncate text-[13px] font-black tabular-nums">{value}</div>
    </div>
  );
}

function Patch({ kind, text }: { kind: string; text: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-2 border-ink px-2.5 py-2">
      <span className="text-[8px] font-black tracking-[0.6px]">{kind}</span>
      <span className="truncate text-[10px] font-bold">{text}</span>
    </div>
  );
}

function SmallButton({
  tone = "white",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "white" | "coral" }) {
  return (
    <button
      type="button"
      {...props}
      className={[
        "h-9 flex-none border-2 border-ink px-3.5 text-[11px]",
        tone === "coral" ? "bg-coral font-black text-white" : "bg-white font-bold text-ink",
        "cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
