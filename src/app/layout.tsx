import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Hanken_Grotesk, Source_Serif_4, Noto_Sans_TC, Noto_Serif_TC } from "next/font/google";
import { TRPCProvider } from "@/lib/trpc/provider";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { HTML_LANG, LOCALE_COOKIE, resolveLocale } from "@/i18n/config";
import { Header } from "@/components/layout/Header";
import { OnboardingModal } from "@/components/layout/OnboardingModal";
import "./globals.css";

// Humanist grotesk for UI (à la Helsinki Grotesk) + a reading serif. Exposed as
// CSS variables consumed by globals.css.
// NOTE: next/font injects a metric-matched `local(Arial)` fallback face (no
// unicode-range) for each Latin font, which sits ahead of Noto in the cascade. The
// REAL Hanken/Source Serif faces ARE unicode-range-restricted (Latin/Cyrillic only),
// so they decline CJK and Chinese falls through to Noto on every target platform
// (macOS/iOS/Android/Windows/Linux — Arial lacks Hanzi there). `adjustFontFallback:
// false` would drop the Arial face but is a no-op under Turbopack in this version, so
// we accept it — see "Known limitations" in docs/i18n-zh-tw-plan.md.
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-serif",
  display: "swap",
});
// Traditional-Chinese faces, appended to the Latin stacks in globals.css so Latin
// glyphs stay in Hanken/Source Serif and CJK falls through to Noto. CJK fonts are
// huge and have no meaningful preload subset, so `preload: false` — load on use.
const notoSansTC = Noto_Sans_TC({
  weight: ["400", "500", "700"],
  variable: "--font-sans-tc",
  display: "swap",
  preload: false,
});
const notoSerifTC = Noto_Serif_TC({
  weight: ["400", "600", "700"],
  variable: "--font-serif-tc",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Hard Problem",
  description:
    "A learning platform for STEM professionals to develop rigorous thinking about technology ethics — using real papers, structured peer discussion, and AI grounded in source material.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // cookies()/headers() are async in Next 16 and reading them marks the root
  // dynamic — acceptable here (this is an authed, interactive app, not a static
  // site). Cookie wins; else Accept-Language so TW devices render zh-TW on first
  // paint. The ?lang= param is adopted client-side in LocaleProvider.
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerList.get("accept-language"),
  );

  return (
    <html
      lang={HTML_LANG[locale]}
      className={`${hanken.variable} ${sourceSerif.variable} ${notoSansTC.variable} ${notoSerifTC.variable}`}
      suppressHydrationWarning
    >
      <body>
        <TRPCProvider>
          <ThemeProvider>
            <LocaleProvider initialLocale={locale}>
              <Header />
              <main>{children}</main>
              <OnboardingModal />
            </LocaleProvider>
          </ThemeProvider>
        </TRPCProvider>
      </body>
    </html>
  );
}
