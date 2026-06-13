"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import en from "./messages/en.json";
import zhTW from "./messages/zh-TW.json";
import { DEFAULT_LOCALE, HTML_LANG, LOCALE_COOKIE, type Locale, isLocale } from "./config";

type Messages = Record<string, string>;

// Static import — both catalogs ship to the client. That "server dictionaries stay
// off the wire" benefit of locale-routed i18n is moot here: the app is 100% client
// components, so strings reach the browser regardless (see docs/i18n-zh-tw-plan.md).
const DICTIONARIES: Record<Locale, Messages> = { en, "zh-TW": zhTW };

type LocaleContextValue = {
  locale: Locale;
  // `persist` (default true) writes a durable 1-year cookie — for explicit user
  // choices. Pass false for transient hints (a ?lang join link) so they last the
  // browser session only and don't hijack a returning visitor's language.
  setLocale: (next: Locale, opts?: { persist?: boolean }) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  // Seeded from the server-resolved cookie/Accept-Language → no flash of the wrong
  // language. (Theme can't do this — it's localStorage-backed and rehydrates in an
  // effect; locale is cookie-backed precisely so the server knows it up front.)
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale, opts?: { persist?: boolean }) => {
    if (!isLocale(next)) return;
    // Write the cookie so the SERVER resolves <html lang> on the next navigation/
    // reload. A durable choice gets a 1-year cookie; a transient hint gets a session
    // cookie (no max-age → cleared when the browser closes). Either way the server
    // can read it for the rest of THIS visit, so reloads mid-event stay in language.
    const persist = opts?.persist ?? true;
    const maxAge = persist ? "; max-age=31536000" : "";
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/${maxAge}; samesite=lax`;
    document.documentElement.lang = HTML_LANG[next]; // keep in sync without a reload
    setLocaleState(next);
  }, []);

  // The root layout has no access to ?lang= (searchParams aren't passed to layouts),
  // so a join/QR link that carries ?lang=zh-TW is honored here on mount. Adopt it for
  // the session ONLY (persist:false): a one-off scan of a host's Chinese room must not
  // permanently flip an English visitor's language for a year on every future visit.
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("lang");
    if (isLocale(param) && param !== locale) setLocale(param, { persist: false });
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<LocaleContextValue>(() => {
    const dict = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
    const fallback = DICTIONARIES[DEFAULT_LOCALE];
    return {
      locale,
      setLocale,
      t: (key, vars) => {
        // Missing key in the active locale → fall back to English, never blank.
        const template = dict[key] ?? fallback[key];
        if (template == null) {
          if (process.env.NODE_ENV !== "production") {
            console.warn(`[i18n] missing key: ${key}`);
          }
          return key;
        }
        return interpolate(template, vars);
      },
    };
  }, [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
}

export function useT(): LocaleContextValue["t"] {
  return useLocale().t;
}
