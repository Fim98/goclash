import { useT, type MessageKey } from "@/lib/i18n";

/**
 * Boards that have not landed yet (tickets 04–07) render this instead of a
 * blank screen, so every page is navigable from day one.
 */
export function PagePlaceholder({ label }: { label: MessageKey }) {
  const t = useT();
  return (
    <div className="grid flex-1 place-items-center border-4 border-ink bg-surface shadow-[8px_8px_0_var(--color-mint)]">
      <p className="text-[13px] font-black tracking-[1.4px]">
        {t("{label} · 本页施工中", { label: t(label) })}
      </p>
    </div>
  );
}
