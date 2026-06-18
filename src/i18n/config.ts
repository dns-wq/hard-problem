// i18n core config — pure constants + locale resolution, NO React. Safe to import
// from the server root layout (to set <html lang>) and from the client provider.
//
// We ship exactly two locales: English and Traditional Chinese (Taiwan). There is
// no generic "zh" and never a Simplified/Mainland variant — see docs/i18n-zh-tw-plan.md.

export const LOCALES = ["en", "zh-TW"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

// Cookie name follows the existing `hp-` convention (cf. the `hp-theme` localStorage
// key). Stored as a cookie — not localStorage — so the SERVER can read it during
// render and set <html lang> with no flash of the wrong language.
export const LOCALE_COOKIE = "hp-locale";

// BCP-47 value for the <html lang> attribute (screen readers, search engines).
// zh-TW → zh-Hant-TW (explicitly Traditional script, Taiwan region).
export const HTML_LANG: Record<Locale, string> = {
  en: "en",
  "zh-TW": "zh-Hant-TW",
};

export function isLocale(value: string | null | undefined): value is Locale {
  return value != null && (LOCALES as readonly string[]).includes(value);
}

// Server-side resolution order: an explicit cookie always wins; otherwise sniff the
// Accept-Language header so a first-time visitor on a Taiwanese device renders in
// Chinese on the very first paint (before any cookie exists). The `?lang=` query
// param is applied client-side (LocaleProvider) since the root layout has no
// access to searchParams.
export function resolveLocale(
  cookieValue: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  return localeFromAcceptLanguage(acceptLanguage);
}

// Parse Accept-Language into (tag, q) pairs and walk them by descending priority.
// We ship ONLY Traditional Chinese, so the rule is an ALLOWLIST, not a denylist:
//   - explicit Traditional/Taiwan/HK/Macau (zh-TW, zh-Hant*, zh-HK, zh-MO) → zh-TW
//   - a truly bare "zh" (no region/script subtag) → zh-TW (best we can offer)
//   - ANY other Chinese variant (zh-CN, zh-Hans, zh-SG, zh-MY, …) → en, since we
//     don't ship Simplified and Traditional would be the wrong script
//   - English (or any non-Chinese) → en
// Crucially this respects q-weights/order, so "en-US,en;q=0.9,zh;q=0.1" → en
// (English-dominant user is NOT flipped to Chinese by a low-priority zh fallback).
function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;

  const tags = header
    .split(",")
    .map((part, index) => {
      const [rawTag, ...params] = part.trim().split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? Number.parseFloat(qParam.split("=")[1]) : 1;
      return { tag: rawTag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 1, index };
    })
    .filter((t) => t.tag && t.tag !== "*")
    // Sort by q descending; ties keep header order (stable).
    .sort((a, b) => b.q - a.q || a.index - b.index);

  for (const { tag } of tags) {
    if (/^zh-(tw|hant|hk|mo)\b/.test(tag)) return "zh-TW"; // explicit Traditional
    if (tag === "zh") return "zh-TW"; // bare zh — only Traditional is on offer
    if (tag.startsWith("zh")) return DEFAULT_LOCALE; // any other Chinese (Simplified) → en
    if (tag === "en" || tag.startsWith("en-")) return DEFAULT_LOCALE; // English → en
    // Otherwise (fr, ja, …): not decisive — keep scanning lower-priority tags.
  }
  return DEFAULT_LOCALE;
}
