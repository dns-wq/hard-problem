# i18n — Traditional Chinese (Taiwan) for Hard Problem

**Status:** planning / spec for review
**Driver:** the live games will be hosted in Taiwan; attendees need a native-feeling
Traditional-Chinese interface (and, over time, Chinese content).
**Runway:** ~2+ months → build it properly, not as an event hack.

## Decisions (locked)

| Question | Decision |
| --- | --- |
| Bilingual vs zh-only | **Bilingual** — keep English, add 繁體中文 with a switch; default TW visitors to Chinese. |
| Voice / register | **你 — warm & friendly.** Modern TW consumer/edu tone; avoid 公文腔 (officialese). |
| Content translation scope | **Games' content first** — only the topics/quiz questions used in the TW sessions; broaden later. |
| Timeline | **2+ months** — full platform i18n is realistic; still sequence event-first. |
| Brand name | Keep **"Hard Problem"** as the English wordmark (the Chalmers reference); use 困難問題 in body copy. |

Locale code throughout: **`zh-TW`** (and `en`). Never `zh-CN`, never generic `zh`.

---

## The shape of the problem

i18n here is **two independent problems** with different mechanics:

- **Layer 1 — interface strings.** Buttons, labels, headings, the entire live/host/quiz
  UI. Today these are hardcoded English inline in JSX (~110 strings in the live feature
  alone; 400–800 app-wide). No i18n deps exist.
- **Layer 2 — educational content.** Topic titles, `framing_note`, `discussion_prompt`,
  `real_world_anchor`, paper abstracts, quiz questions/options/explanations, concepts —
  all live in Postgres, all English.

They get different solutions. Layer 1 is a string catalog; Layer 2 is a DB translation
overlay. The **register/glossary** (below) is shared by both and is the single biggest
quality lever.

---

## Layer 1 — interface strings

**Constraint that simplifies everything:** every page is a client component
(`"use client"`). So we skip Next's locale-prefixed routing entirely (no `/en`, `/zh-TW`
URL surgery) and use a lightweight client-side catalog. This matches the project's
"token-layer, not a component-library" philosophy and adds **zero runtime deps**.

### Pieces

1. **Catalogs** — `src/i18n/en.json` + `src/i18n/zh-TW.json`, flat namespaced keys:
   ```json
   { "live.join.title": "Join the live session",
     "live.join.cta": "Join",
     "live.join.guestHint": "Enter your name to jump in — no account needed.",
     "quiz.correct": "Correct! 🎉",
     "quiz.timeUp": "Time's up." }
   ```
   `en.json` is the source of truth; `zh-TW.json` is produced by the Claude workflow
   (below) and human-reviewed. A missing key falls back to `en` (and logs in dev).

2. **`LocaleProvider` + `useT()`** — a tiny context (`src/i18n/LocaleProvider.tsx`):
   ```tsx
   const t = useT();
   t("live.join.guestHint");
   t("quiz.score", { points: 500 });   // {points} interpolation
   ```
   Interpolation = `{name}` replacement; pluralization is rarely needed in Chinese (no
   plural forms) so a simple `{count}` suffices. ~40 lines, no dependency.

3. **Locale resolution** (priority order):
   1. `?lang=zh-TW` query param (the **join/QR links carry this** so event attendees
      land in Chinese regardless of device) → persists to cookie.
   2. `locale` cookie (set by the switcher).
   3. `Accept-Language` header → TW/zh visitors default to `zh-TW`, else `en`.
   The cookie is read **server-side in `layout.tsx`** to set `<html lang>` correctly and
   avoid a flash; the client provider hydrates from the same cookie.

4. **Language switcher** — a small control in `Header`; writes the cookie, swaps catalog,
   updates `<html lang>`. Persisted per-device.

5. **`<html lang>`** — currently hardcoded `lang="en"` in `layout.tsx:34`. Make it derive
   from the resolved locale (server-read cookie) so it's `zh-Hant-TW` for screen readers
   and search.

### Fonts (preserve the humane-editorial identity)

Add Traditional-Chinese faces **appended** to the existing stacks so Latin glyphs stay in
Hanken Grotesk / Source Serif and CJK falls through to Noto:

```ts
import { Noto_Sans_TC, Noto_Serif_TC } from "next/font/google";
const notoSansTC  = Noto_Sans_TC({  weight: ["400","500","700"], variable: "--font-sans-tc",  display: "swap" });
const notoSerifTC = Noto_Serif_TC({ weight: ["400","600","700"], variable: "--font-serif-tc", display: "swap" });
```

Then in `globals.css` the body/serif font stacks become e.g.
`font-family: var(--font-sans), var(--font-sans-tc), system-ui, sans-serif;`.
Noto Serif TC = Source Han Serif, which pairs naturally with the HDS-inspired look and
keeps reading surfaces editorial in both scripts.

> Note: Noto Sans/Serif TC are large fonts. `next/font` subsets automatically, but verify
> bundle/network cost on the live phone screens. If load is heavy, pin a narrower weight
> set (400/700 only) for the TC faces.

---

## Layer 2 — educational content

A single additive migration — **no churn to existing content tables**:

```sql
CREATE TABLE public.content_translations (
  entity_type  TEXT NOT NULL,                 -- 'topic' | 'quiz_question' | 'paper' | 'concept'
  entity_id    UUID NOT NULL,
  locale       TEXT NOT NULL,                 -- 'zh-TW'
  field        TEXT NOT NULL,                 -- 'title' | 'framing_note' | 'explanation' | ...
  value        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'machine' CHECK (status IN ('machine','reviewed')),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (entity_type, entity_id, locale, field)
);
-- RLS: public-read for rows whose base entity is published; writes via service-role only.
```

- **Read path:** a helper overlays translations onto base rows for the active locale and
  **falls back to the English base value when a translation row is missing** — nothing
  ever renders blank, and partial translation is safe to ship.
- **Publish gate:** only `status='reviewed'` rows are served in production; `'machine'`
  rows are visible to Morris in a review view. (Mirrors the opt-in/review caution from the
  transcript + reminder work.)
- **JSONB fields** (`real_world_anchor`) translate per sub-field with a dotted `field`
  key (e.g. `real_world_anchor.body`).
- **Quiz care:** `correct_answer` stores the option **label** (`'A'`, `'true'`) — never
  translate it. Only `question_text`, option **text**, and `explanation` translate.

Content i18n follows the same `value ?? base` fallback contract everywhere, so an
un-translated topic simply shows in English.

---

## Taiwan register & glossary (the craft layer)

This is what separates "native" from "obviously machine-translated." Both layers'
translation prompts cite this section verbatim.

### Rules
- **Traditional characters, Taiwan usage** — not Simplified, not HK conventions.
- **Full-width punctuation** in Chinese runs: `，。、？！`; quotes `「」` / `『』`;
  full-width parens `（）` around Chinese, half-width around Latin/code.
- **你 register, warm.** Friendly and direct; avoid stiff 公文腔. Exclamations welcome on
  game surfaces.
- Keep Latin technical tokens (`QR`, `URL`, brand "Hard Problem") un-translated.

### UI term map (TW ✅ / avoid ❌)
| English | Taiwan ✅ | Avoid ❌ (Mainland) |
| --- | --- | --- |
| software | 軟體 | 软件 |
| program / code | 程式 | 程序 |
| network / online | 網路 / 線上 | 网络 / 在线 |
| information | 資訊 | 信息 |
| log in / sign in | 登入 | 登录 |
| settings | 設定 | 设置 |
| account | 帳號 | 账号 |
| default | 預設 | 默认 |
| link | 連結 | 链接 |
| video | 影片 | 视频 |
| click / tap | 點選 / 點按 | 点击 |
| algorithm | 演算法 | 算法 |
| user | 使用者 | 用户 |

### Philosophy glossary (TW academic)
| English | 繁中 (TW) |
| --- | --- |
| the hard problem (of consciousness) | 意識的困難問題 |
| consciousness | 意識 |
| qualia | 感質 |
| mind–body problem | 心物問題 |
| trolley problem | 電車難題 |
| thought experiment | 思想實驗 |
| free will | 自由意志 |
| utilitarianism | 效益主義 |
| deontology | 義務論 |
| virtue ethics | 德行倫理學 |
| algorithmic fairness | 演算法公平性 |
| privacy | 隱私 |
| informed consent | 知情同意 |

This table is the strongest quality lever — extend it as content is translated, and have
the reviewer add any term the translator guesses inconsistently.

### Voice samples (game surfaces)
| English | 繁中 (你, warm) |
| --- | --- |
| Enter your name to jump in — no account needed. | 輸入名字就能加入，免註冊 |
| Join | 加入 |
| Correct! 🎉 | 答對了！🎉 |
| Not this time. | 差一點！ |
| Time's up. | 時間到 |
| Answer locked in — waiting for the host to reveal. | 答案已送出，等主持人公布結果 |
| Scan to join | 掃描加入 |
| You're in! | 加入成功！ |

---

## Claude-assisted translation workflow

Both layers translate the same way: Claude, with **the register + glossary section as
system context**, produces machine translations that Morris reviews.

- **Layer 1:** feed `en.json` → get `zh-TW.json`. Keys are stable; re-runs only touch new
  keys. Glossary + voice samples + "你, warm, TW usage, full-width punctuation" in the
  prompt.
- **Layer 2:** a script pulls published rows for the entities used in the games → one
  translation pass per field → writes `content_translations` rows as `status='machine'`.
  Morris reviews in a simple admin view and flips to `'reviewed'` (only reviewed rows
  ship). Quiz labels excluded from translation by construction.
- **Glossary adherence** is enforced by prompt; the reviewer's corrections feed back into
  the glossary table so later batches improve.

---

## Phasing & tasks (event-first)

### Phase 0 — infrastructure (~½–1 day)
- [ ] `LocaleProvider` + `useT()` + interpolation/fallback + dev missing-key warning.
- [ ] `en.json` / `zh-TW.json` scaffolding; key-naming convention.
- [ ] Locale resolution: `?lang` → cookie → `Accept-Language`; server-read in `layout.tsx`.
- [ ] Language switcher in `Header`; dynamic `<html lang>`.
- [ ] Noto Sans/Serif TC via `next/font`; append to `globals.css` font stacks; verify load cost.

### Phase 1 — event surfaces (the priority)
- [ ] Extract live/host/quiz/spotlight/raffle/RSVP/leaderboard/recap strings → keys.
- [ ] Extract nav / auth / landing strings → keys.
- [ ] Claude-translate that subset; Morris review.
- [ ] On-device QA in 繁中 (join → play → quiz → reveal → spotlight), incl. line-wrap/overflow.

### Phase 2 — rest of platform UI
- [ ] Topics, papers, profile, settings, onboarding, all remaining pages → keys + translate.

### Phase 3 — content (games' content first)
- [ ] `content_translations` migration (+ PG16 tests) + read-overlay helper + RLS.
- [ ] Translation script (`status='machine'`) + minimal review view.
- [ ] Translate the specific topics/questions used in the TW sessions; review → `reviewed`.
- [ ] Broaden as bandwidth allows.

---

## Known limitations & pinned terms
- **CJK font fallback face (cosmetic, non-target configs only).** `next/font` injects a
  metric-matched `local(Arial)` fallback (no `unicode-range`) for each Latin font that
  sits ahead of Noto in the cascade. The real Hanken/Source Serif faces *are*
  `unicode-range`-restricted, so they decline CJK and Chinese falls through to Noto on
  every launch platform (macOS/iOS/Android/Windows/Linux — Arial has no Hanzi there;
  verified live). The only theoretical misrender is a config where "Arial" is OS-aliased
  to a pan-CJK face. `adjustFontFallback:false` would remove the Arial face but is a
  **no-op under Turbopack** in Next 16.2.2, so we accept this rather than hardcode a
  fragile generated family name. Revisit if a real device shows wrong-face CJK.
- **First-paint `?lang` flash (one frame, first scan only).** The root layout can't read
  `searchParams`, so a brand-new guest (no cookie) on a non-TW device scanning a
  `?lang=zh-TW` QR sees English header chrome for one frame before `LocaleProvider`'s
  mount effect adopts the param. It self-corrects immediately and — because `?lang`
  now sets a **session cookie** — every subsequent reload/navigation that visit is
  server-resolved (no further flash). Accepted trade-off of the no-locale-routing
  decision; revisit only if it reads poorly on real devices.
- **`?lang` is session-scoped, the switcher is durable.** A `?lang` join link sets a
  session cookie (clears on browser close) so it can't permanently override a returning
  visitor's language; only an explicit Header toggle writes the 1-year cookie.
- **Pinned button label:** "Host live session" → **「主持即時場次」**. The `live.join.hostHint`
  copy quotes this label, so when the topic-page button is localized (Phase 1) it MUST
  land on exactly `主持即時場次` or the cross-reference breaks (button at
  `src/app/topics/[slug]/page.tsx`, currently hardcoded English).

## Risks & open questions
- **Translation memory drift** — keep one glossary table; reviewer corrections flow back.
- **Layout/overflow** — Chinese is denser; QA every live screen for wrapping (esp. the
  fixed projector layouts and phone buttons).
- **Font weight cost** — TC faces are large; pin the minimal weight set if network-heavy
  on event phones.
- **`<html lang>` flash** — must be server-resolved from the cookie, not client-only.
- **Admin review UX for content** — Phase 3 needs a lightweight reviewed/machine toggle;
  scope it minimally (a filtered list + inline edit), not a full CMS.
- **Brand/title metadata** — `metadata.title/description` (`layout.tsx:24`) should also be
  localized for share/SEO once Phase 2 lands.
