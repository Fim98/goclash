import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AsyncPanel } from "./state-panel";

describe("AsyncPanel", () => {
  it("shows children only in the ready state", () => {
    render(
      <AsyncPanel state="ready">
        <div>数据已就绪</div>
      </AsyncPanel>,
    );

    expect(screen.getByText("数据已就绪")).toBeInTheDocument();
  });

  it("shows outlined skeletons while loading", () => {
    const { container } = render(<AsyncPanel state="loading">不应出现</AsyncPanel>);

    expect(screen.queryByText("不应出现")).not.toBeInTheDocument();
    expect(container.querySelectorAll("[aria-hidden]")).toHaveLength(3);
  });

  it("shows the error copy and its recovery actions", () => {
    render(
      <AsyncPanel
        state="error"
        error={{
          title: "内核暂时不可用",
          description: "无法从内核读取代理信息。",
          icon: <span data-icon="warn" />,
          actions: <button>重启内核</button>,
        }}
      >
        不应出现
      </AsyncPanel>,
    );

    expect(screen.queryByText("不应出现")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "内核暂时不可用" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重启内核" })).toBeInTheDocument();
  });

  it("shows the empty copy with its primary action", () => {
    render(
      <AsyncPanel
        state="empty"
        empty={{
          title: "还没有订阅",
          description: "去订阅页粘贴订阅链接。",
          action: <button>去订阅页</button>,
        }}
      >
        不应出现
      </AsyncPanel>,
    );

    expect(screen.queryByText("不应出现")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "还没有订阅" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "去订阅页" })).toBeInTheDocument();
  });
});
