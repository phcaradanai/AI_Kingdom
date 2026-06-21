import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { resolveMessage } from "./i18nMessages";

export type LanguageCode = "en" | "th";

/** Variables for `{name}` interpolation in semantic-key translations. */
export type TranslationVars = Record<string, string | number>;

export const LANGUAGE_STORAGE_KEY = "ai-kingdom-ui-language";

export const SUPPORTED_LANGUAGES: Array<{ code: LanguageCode; label: string; nativeLabel: string }> = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "th", label: "Thai", nativeLabel: "ภาษาไทย" }
];

const THAI_TRANSLATIONS: Record<string, string> = {
  "AI Kingdom": "อาณาจักร AI",
  "Royal Command": "ศูนย์บัญชาการหลวง",
  Kingdom: "ราชอาณาจักร",
  "Mission Control": "ศูนย์บัญชาการภารกิจ",
  Command: "การบัญชาการ",
  Work: "งาน",
  Knowledge: "คลังความรู้",
  Agents: "เอเจนต์",
  "Agents & Models": "เอเจนต์และโมเดล",
  System: "ระบบ",
  Dashboard: "แดชบอร์ด",
  Overview: "ภาพรวม",
  "Action Queue": "คิวงานที่ต้องทำ",
  Operations: "ปฏิบัติการ",
  "Royal Brief": "สรุปประจำวันหลวง",
  "Throne Room": "ห้องบัลลังก์",
  "Operations Center": "ศูนย์ปฏิบัติการ",
  "Kingdom Inbox": "กล่องงานราชอาณาจักร",
  Projects: "โปรเจกต์",
  "Work Orders": "ใบสั่งงาน",
  "Project Inbox": "กล่องโปรเจกต์",
  Artifacts: "อาร์ติแฟกต์",
  Reports: "รายงาน",
  Memory: "ความจำ",
  Council: "สภา",
  "Knowledge Lab": "ห้องทดลองความรู้",
  Charter: "กฎบัตร",
  Vision: "วิสัยทัศน์",
  "Living Agents": "เอเจนต์มีชีวิต",
  "External Agents": "เอเจนต์ภายนอก",
  Providers: "ผู้ให้บริการ",
  Routing: "การกำหนดเส้นทาง",
  "Automation Jobs": "งานอัตโนมัติ",
  "Living Loop": "ลูปมีชีวิต",
  Treasury: "คลัง",
  "Audit Log": "บันทึกตรวจสอบ",
  Settings: "การตั้งค่า",
  Users: "ผู้ใช้",
  Notices: "ประกาศ",
  Matters: "เรื่อง",
  Security: "ความปลอดภัย",
  Profile: "โปรไฟล์",
  "Open source profile": "เปิดโปรไฟล์ต้นทาง",
  "Sign out": "ออกจากระบบ",
  Unknown: "ไม่ทราบ",
  KING: "กษัตริย์",
  "CROWN PRINCE": "มกุฎราชกุมาร",
  MINISTER: "เสนาบดี",
  SCRIBE: "อาลักษณ์",
  English: "English",
  Thai: "ภาษาไทย",
  Language: "ภาษา",
  "Display language": "ภาษาที่แสดง",
  "Desktop navigation": "เมนูนำทางเดสก์ท็อป",
  "Collapse navigation": "ย่อเมนูนำทาง",
  "Expand navigation": "ขยายเมนูนำทาง",
  "Live sync": "ซิงก์สด",
  "Kingdom configuration": "การตั้งค่าราชอาณาจักร",
  "Tune AI provider defaults and system behavior. API keys remain server-only in `.env`.":
    "ปรับค่าเริ่มต้นผู้ให้บริการ AI และพฤติกรรมระบบ คีย์ API อยู่ฝั่งเซิร์ฟเวอร์เท่านั้นใน `.env`",
  "AI Settings": "การตั้งค่า AI",
  "Provider Status": "สถานะผู้ให้บริการ",
  "System Behavior": "พฤติกรรมระบบ",
  "UI Settings": "การตั้งค่าหน้าจอ",
  Backend: "แบ็กเอนด์",
  Database: "ฐานข้อมูล",
  "Frontend Mode": "โหมดฟรอนต์เอนด์",
  "API URL": "URL ของ API",
  "PostgreSQL via Prisma": "PostgreSQL ผ่าน Prisma",
  "API keys are never returned by the settings or providers APIs. Configure secrets only in the server `.env`.":
    "API settings และ providers จะไม่ส่งคีย์ API กลับมา ตั้งค่า secret เฉพาะใน `.env` ฝั่งเซิร์ฟเวอร์",
  "Provider selection, model names, and per-provider timeouts are also configured in `.env` and the Provider Registry.":
    "การเลือกผู้ให้บริการ ชื่อโมเดล และ timeout รายผู้ให้บริการตั้งค่าได้ใน `.env` และ Provider Registry",
  Enabled: "เปิดใช้",
  Disabled: "ปิดใช้",
  Saving: "กำลังบันทึก",
  "Saving...": "กำลังบันทึก...",
  Save: "บันทึก",
  Saved: "บันทึกแล้ว",
  "Low cost": "ต้นทุนต่ำ",
  Balanced: "สมดุล",
  Quality: "คุณภาพ",
  "Draft for King review": "ฉบับร่างให้กษัตริย์ตรวจ",
  "Ready for assignment": "พร้อมมอบหมาย",
  active: "เปิดใช้งาน",
  inactive: "ปิดใช้งาน",
  chat: "แชต",
  tools: "เครื่องมือ",
  vision: "วิชัน",
  json: "JSON",
  env: "env",
  "no env": "ไม่มี env",
  default: "ค่าเริ่มต้น",
  modified: "แก้ไขแล้ว",
  updated: "อัปเดต",
  "Patch Review": "ตรวจแพตช์",
  "Patch Queue Clear": "คิวแพตช์ว่าง",
  "No patches are awaiting review.": "ไม่มีแพตช์รอตรวจ",
  "Auto Patch Today": "แพตช์อัตโนมัติวันนี้",
  "Stale-Context Patches": "แพตช์ที่ context เก่า",
  "Import patch before approving the job so the runner receives the correct patch payload.":
    "นำเข้าแพตช์ก่อนอนุมัติงาน เพื่อให้ runner ได้ payload แพตช์ที่ถูกต้อง",
  "Check Failed": "ตรวจไม่ผ่าน",
  "Validation Failed": "ตรวจสอบไม่ผ่าน",
  "No Changes": "ไม่มีการเปลี่ยนแปลง",
  Validated: "ตรวจสอบแล้ว",
  "Context refresh required before patching": "ต้องรีเฟรช context ก่อนแพตช์",
  "Review patch": "ตรวจแพตช์",
  "Request revision": "ขอแก้ไข",
  Approve: "อนุมัติ",
  Reject: "ปฏิเสธ",
  "Create PR": "สร้าง PR"
};

const TRANSLATIONS: Record<LanguageCode, Record<string, string>> = {
  en: {},
  th: THAI_TRANSLATIONS
};

type I18nContextValue = {
  language: LanguageCode;
  setLanguage: (language: LanguageCode, options?: { persist?: boolean }) => void;
  /** Legacy display-text translation (matches whole English strings). */
  t: (text: string) => string;
  /** Semantic-key translation with `{var}` interpolation — the migration target. */
  tk: (key: string, vars?: TranslationVars) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const originalTextByNode = new WeakMap<Text, string>();
const originalAttrByElement = new WeakMap<Element, Map<string, string>>();
const TRANSLATED_ATTRIBUTES = ["aria-label", "title", "placeholder"];
const SKIP_TEXT_PARENTS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "CODE", "PRE", "KBD", "SAMP"]);

export function normalizeLanguage(value: string | null | undefined): LanguageCode {
  return value === "th" ? "th" : "en";
}

export function translateText(text: string, language: LanguageCode): string {
  const dictionary = TRANSLATIONS[language];
  if (!dictionary || Object.keys(dictionary).length === 0) return text;
  const leading = text.match(/^\s*/)?.[0] ?? "";
  const trailing = text.match(/\s*$/)?.[0] ?? "";
  const trimmed = text.trim();
  if (!trimmed) return text;
  return dictionary[trimmed] ? `${leading}${dictionary[trimmed]}${trailing}` : text;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(() => readStoredLanguage());

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage: (nextLanguage, options) => {
      setLanguageState(nextLanguage);
      if (options?.persist !== false) writeStoredLanguage(nextLanguage);
    },
    t: (text) => translateText(text, language),
    tk: (key, vars) => resolveMessage(key, language, vars)
  }), [language]);

  useEffect(() => {
    document.documentElement.lang = language === "th" ? "th" : "en";
    applyLanguagePatch(document.body, language);

    let frame = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => applyLanguagePatch(document.body, language));
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: TRANSLATED_ATTRIBUTES });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  const [fallbackLanguage, setFallbackLanguage] = useState<LanguageCode>(() => readStoredLanguage());
  if (context) return context;
  return {
    language: fallbackLanguage,
    setLanguage: (nextLanguage: LanguageCode, options?: { persist?: boolean }) => {
      setFallbackLanguage(nextLanguage);
      if (options?.persist !== false) writeStoredLanguage(nextLanguage);
    },
    t: (text: string) => translateText(text, fallbackLanguage),
    tk: (key: string, vars?: TranslationVars) => resolveMessage(key, fallbackLanguage, vars)
  };
}

export function hasStoredLanguagePreference() {
  return globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY) !== null;
}

function readStoredLanguage() {
  return normalizeLanguage(globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY));
}

function writeStoredLanguage(language: LanguageCode) {
  globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, language);
}

export function useTranslate() {
  return useI18n().t;
}

/** Hook for semantic-key translation: `const tk = useTk(); tk("inbox.title")`. */
export function useTk() {
  return useI18n().tk;
}

function applyLanguagePatch(root: ParentNode | null, language: LanguageCode) {
  if (!root) return;
  patchTextNodes(root, language);
  patchAttributes(root, language);
}

function patchTextNodes(root: ParentNode, language: LanguageCode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent || SKIP_TEXT_PARENTS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let node = walker.nextNode() as Text | null;
  while (node) {
    const current = node.textContent ?? "";
    const storedOriginal = originalTextByNode.get(node);
    const storedTranslation = storedOriginal ? translateText(storedOriginal, "th") : null;
    const original = storedOriginal && (current === storedOriginal || current === storedTranslation) ? storedOriginal : current;
    originalTextByNode.set(node, original);
    const nextText = language === "en" ? original : translateText(original, language);
    if (node.textContent !== nextText) node.textContent = nextText;
    node = walker.nextNode() as Text | null;
  }
}

function patchAttributes(root: ParentNode, language: LanguageCode) {
  const elements = root instanceof Element ? [root, ...Array.from(root.querySelectorAll("*"))] : Array.from(root.querySelectorAll("*"));
  for (const element of elements) {
    let originalAttrs = originalAttrByElement.get(element);
    for (const attribute of TRANSLATED_ATTRIBUTES) {
      const current = element.getAttribute(attribute);
      if (!current?.trim()) continue;
      if (!originalAttrs) {
        originalAttrs = new Map();
        originalAttrByElement.set(element, originalAttrs);
      }
      const storedOriginal = originalAttrs.get(attribute);
      const storedTranslation = storedOriginal ? translateText(storedOriginal, "th") : null;
      const original = storedOriginal && (current === storedOriginal || current === storedTranslation) ? storedOriginal : current;
      originalAttrs.set(attribute, original);
      const nextValue = language === "en" ? original : translateText(original, language);
      if (current !== nextValue) element.setAttribute(attribute, nextValue);
    }
  }
}
