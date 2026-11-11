import type { MessageKey } from "./i18n";

/**
 * Region labels for the exit card.
 *
 * The gateway sends an ISO code plus a pre-rendered Chinese name; the UI takes
 * the code and labels it itself so an English window never shows 「中国香港」.
 * Codes we do not know fall through to whatever the gateway sent.
 */
export const REGION_NAME: Record<string, MessageKey> = {
  HK: "中国香港",
  MO: "中国澳门",
  TW: "中国台湾",
  CN: "中国大陆",
  JP: "日本",
  SG: "新加坡",
  KR: "韩国",
  US: "美国",
  GB: "英国",
  UK: "英国",
  DE: "德国",
  FR: "法国",
  CA: "加拿大",
  AU: "澳大利亚",
  NL: "荷兰",
  RU: "俄罗斯",
  IN: "印度",
  TR: "土耳其",
  MY: "马来西亚",
  TH: "泰国",
  VN: "越南",
  PH: "菲律宾",
  ID: "印度尼西亚",
  AE: "阿联酋",
  BR: "巴西",
};
