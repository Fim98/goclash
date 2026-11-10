import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DataTableColumn<Row> {
  key: string;
  header: ReactNode;
  /** Fixed width in px; omit to let the column flex and absorb the remainder. */
  width?: number;
  align?: "left" | "right";
  cell: (row: Row) => ReactNode;
}

export interface DataTableProps<Row> {
  columns: ReadonlyArray<DataTableColumn<Row>>;
  rows: ReadonlyArray<Row>;
  rowKey: (row: Row) => string;
  /**
   * Per-row emphasis: the connections table uses it for the tracked row
   * (sunny highlight), the rules table for the inverted MATCH row (ink).
   */
  rowClassName?: (row: Row) => string;
  /** 59px default; 53px for the log console. */
  rowHeight?: number;
  /** Pinned to the bottom of the frame: counters, "last updated", actions. */
  footer?: ReactNode;
  ariaLabel?: string;
  className?: string;
}

const alignClass = (align?: "left" | "right") => (align === "right" ? "text-right" : undefined);

const cellStyle = (width?: number): CSSProperties =>
  width === undefined ? { flex: "1 1 0%", minWidth: 0 } : { width, flex: "none" };

/**
 * The one table used by connections / rules / logs. Black header 46px, ink row
 * separators, footer pinned to the bottom edge of the frame.
 *
 * Rows are divs with table roles so flexbox can own the column widths — a real
 * <table> would fight the "fixed + flexible" mix the design relies on.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  rowClassName,
  rowHeight = 59,
  footer,
  ariaLabel,
  className,
}: DataTableProps<Row>) {
  return (
    <div
      role="table"
      aria-label={ariaLabel}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden border-4 border-ink bg-white",
        className,
      )}
    >
      <div role="rowgroup">
        <div
          role="row"
          className="flex h-[46px] flex-none items-center bg-ink px-4 text-[9px] font-black tracking-[0.6px] text-white"
        >
          {columns.map((column) => (
            <div
              key={column.key}
              role="columnheader"
              className={cn(
                "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap",
                alignClass(column.align),
              )}
              style={cellStyle(column.width)}
            >
              {column.header}
            </div>
          ))}
        </div>
      </div>

      <div role="rowgroup" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {rows.map((row) => (
          <div
            key={rowKey(row)}
            role="row"
            className={cn(
              "flex flex-none items-center border-b-2 border-ink px-4 last:border-b-0",
              rowClassName?.(row),
            )}
            style={{ height: rowHeight }}
          >
            {columns.map((column) => (
              <div
                key={column.key}
                role="cell"
                className={cn(
                  "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap",
                  alignClass(column.align),
                )}
                style={cellStyle(column.width)}
              >
                {column.cell(row)}
              </div>
            ))}
          </div>
        ))}
      </div>

      {footer ? (
        <div className="flex h-14 flex-none items-center gap-3 border-t-2 border-ink px-4 text-[10px] font-bold">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
