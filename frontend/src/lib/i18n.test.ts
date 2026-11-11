import { describe, expect, it } from "vitest";

import { LOCALES, localeFromSetting, translate } from "./i18n";

describe("i18n", () => {
  it("renders the Chinese key as-is", () => {
    expect(translate("zh-CN", "已连接")).toBe("已连接");
    expect(
      translate("zh-CN", "已用 {percent}% · {date} 到期", { percent: 62, date: "2027-01-12" }),
    ).toBe("已用 62% · 2027-01-12 到期");
  });

  it("swaps in the English copy", () => {
    expect(translate("en-US", "已连接")).toBe("Connected");
    expect(
      translate("en-US", "已用 {percent}% · {date} 到期", { percent: 62, date: "2027-01-12" }),
    ).toBe("62% used · expires 2027-01-12");
  });

  it("keeps a placeholder visible when the value is missing", () => {
    // A typo should look wrong, not silently drop a number from a sentence.
    expect(translate("en-US", "运行 {uptime} · 混合端口 {port}", { uptime: "4h 12m" })).toBe(
      "Up 4h 12m · mixed port {port}",
    );
  });

  it("normalises whatever an older settings file stored", () => {
    expect(localeFromSetting(undefined)).toBe("zh-CN");
    expect(localeFromSetting("简体中文")).toBe("zh-CN");
    expect(localeFromSetting("en-US")).toBe("en-US");
    expect(localeFromSetting("English")).toBe("en-US");
    expect(localeFromSetting("english")).toBe("en-US");
    expect(localeFromSetting("klingon")).toBe("zh-CN");
  });

  it("ships exactly the locales the picker offers", () => {
    expect(LOCALES).toEqual(["zh-CN", "en-US"]);
  });
});
