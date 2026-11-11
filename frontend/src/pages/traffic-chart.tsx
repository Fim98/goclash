import type { TrafficSample } from "@/gateway/types";
import { useT } from "@/lib/i18n";

/**
 * The home traffic graph, hand-drawn SVG after the 01 board: coral download
 * area with a black outline, mint upload line over a black base stroke, faint
 * grid, and a solid marker on the newest download sample.
 *
 * Samples fill left to right; once the 60-sample window (1 Hz) is full the
 * newest sample pins to the right edge and the graph scrolls, matching how
 * mihomo's /traffic stream behaves in existing clients. Pixel dimensions match
 * the 1440×900 window math (780px card, 24px padding) so stroke widths stay
 * literal.
 */
const WINDOW = 60;
const WIDTH = 724;
const HEIGHT = 222;
/** Inset so the newest sample's marker never clips against the SVG edge. */
const PAD_X = 8;
const PAD_Y = 4;

export function TrafficChart({ samples }: { samples: TrafficSample[] }) {
  const t = useT();
  const gridLines = [1, 2, 3, 4].map((i) => (HEIGHT * i) / 5);

  const count = samples.length;
  const peak = Math.max(1, ...samples.map((sample) => Math.max(sample.down, sample.up)));
  const top = peak * 1.15;
  const step = (WIDTH - PAD_X * 2) / (WINDOW - 1);
  const xAt = (index: number) => PAD_X + index * step;
  const yAt = (value: number) => HEIGHT - PAD_Y - (value / top) * (HEIGHT - PAD_Y * 2);

  const downPoints = samples.map((sample, index) => [xAt(index), yAt(sample.down)] as const);
  const upPoints = samples.map((sample, index) => [xAt(index), yAt(sample.up)] as const);
  const baseline = HEIGHT - PAD_Y;
  const lastDown = downPoints[count - 1];

  const areaPath =
    count >= 2
      ? [
          `M ${downPoints[0][0]} ${baseline}`,
          ...downPoints.map(([x, y]) => `L ${x} ${y}`),
          `L ${downPoints[count - 1][0]} ${baseline}`,
          "Z",
        ].join(" ")
      : null;
  const upPath = count >= 2 ? `M ${upPoints.map(([x, y]) => `${x} ${y}`).join(" L ")}` : null;

  return (
    <svg
      role="img"
      aria-label={t("实时流量图")}
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="max-w-full flex-none"
    >
      {gridLines.map((y) => (
        <line
          key={y}
          x1={0}
          x2={WIDTH}
          y1={y}
          y2={y}
          stroke="var(--color-ink)"
          strokeOpacity={0.12}
          strokeWidth={2}
        />
      ))}
      {areaPath ? (
        <path
          d={areaPath}
          fill="var(--color-coral)"
          stroke="var(--color-ink)"
          strokeWidth={4}
          strokeLinejoin="round"
        />
      ) : null}
      {upPath ? (
        <>
          <path d={upPath} stroke="var(--color-ink)" strokeWidth={7} strokeLinejoin="round" />
          <path d={upPath} stroke="var(--color-mint)" strokeWidth={4} strokeLinejoin="round" />
        </>
      ) : null}
      {lastDown ? (
        <rect
          x={lastDown[0] - 7}
          y={lastDown[1] - 7}
          width={14}
          height={14}
          fill="var(--color-ink)"
          stroke="var(--color-white)"
          strokeWidth={2}
        />
      ) : null}
    </svg>
  );
}
