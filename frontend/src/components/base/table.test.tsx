import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataTable, type DataTableColumn } from "./table";

interface Row {
  host: string;
  exit: string;
  tracked?: boolean;
}

const columns: DataTableColumn<Row>[] = [
  { key: "host", header: "主机", cell: (row) => row.host },
  { key: "exit", header: "出口节点", width: 180, cell: (row) => row.exit },
];

const rows: Row[] = [
  { host: "www.youtube.com:443", exit: "香港 · IPLC 02", tracked: true },
  { host: "api.github.com:443", exit: "日本 · 东京 01" },
];

describe("DataTable", () => {
  it("renders header labels and one row per entry", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(row) => row.host} ariaLabel="连接" />);

    expect(screen.getByRole("table", { name: "连接" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "主机" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3); // header row + 2 body rows
    expect(screen.getByRole("cell", { name: "www.youtube.com:443" })).toBeInTheDocument();
  });

  it("applies per-row emphasis classes", () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.host}
        rowClassName={(row) => (row.tracked ? "bg-sunny" : "")}
        footer={<span>已关闭 128 条</span>}
      />,
    );

    const trackedRow = screen.getByRole("row", { name: /www\.youtube\.com/ });
    expect(trackedRow.className).toContain("bg-sunny");
    expect(screen.getByText("已关闭 128 条")).toBeInTheDocument();
  });

  it("renders nothing but the frame when there are no rows", () => {
    render(<DataTable columns={columns} rows={[]} rowKey={(row) => row.host} />);

    expect(screen.getAllByRole("row")).toHaveLength(1);
  });
});
