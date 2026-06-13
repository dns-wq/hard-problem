import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";

// Server-side content-translation overlay (Phase 3). Given base content rows and the
// active locale, replaces translated fields from public.content_translations
// (status='reviewed' only) and FALLS BACK to the base value whenever a translation is
// missing — so partial translation, or none at all, always renders cleanly. English
// (DEFAULT_LOCALE) short-circuits with zero DB work.
//
// Field conventions (see migration 011):
//   "title"                 → row.title
//   "real_world_anchor.body"→ row.real_world_anchor.body   (JSONB sub-field)
//   "option.A"              → the text of the options[] entry whose label is 'A'
//                             (quiz option TEXT only — the answer label is never translated)

type AnyRow = Record<string, unknown>;

function applyField(row: AnyRow, field: string, value: string): void {
  if (field.startsWith("option.")) {
    const label = field.slice("option.".length);
    const options = row.options;
    if (Array.isArray(options)) {
      const opt = options.find((o) => o && typeof o === "object" && (o as AnyRow).label === label);
      if (opt) (opt as AnyRow).text = value;
    }
    return;
  }
  if (field.includes(".")) {
    const [parent, child] = field.split(".");
    const base = row[parent];
    const obj: AnyRow = base && typeof base === "object" ? (base as AnyRow) : {};
    obj[child] = value;
    row[parent] = obj;
    return;
  }
  row[field] = value;
}

export async function overlayTranslations<T>(
  supabase: SupabaseClient,
  locale: Locale,
  entityType: string,
  rows: T[],
  opts?: { idKey?: keyof T },
): Promise<T[]> {
  if (locale === DEFAULT_LOCALE || rows.length === 0) return rows;

  const idKey = String(opts?.idKey ?? "id");
  const idOf = (r: T) => (r as AnyRow)[idKey];
  const ids = Array.from(new Set(rows.map(idOf).filter(Boolean))) as string[];
  if (ids.length === 0) return rows;

  const { data, error } = await supabase
    .from("content_translations")
    .select("entity_id, field, value")
    .eq("entity_type", entityType)
    .in("entity_id", ids)
    .eq("locale", locale)
    .eq("status", "reviewed");
  // Any error or no translations → render the base (English) rows unchanged.
  if (error || !data || data.length === 0) return rows;

  const byEntity = new Map<string, { field: string; value: string }[]>();
  for (const tr of data as { entity_id: string; field: string; value: string }[]) {
    const list = byEntity.get(tr.entity_id) ?? [];
    list.push({ field: tr.field, value: tr.value });
    byEntity.set(tr.entity_id, list);
  }

  return rows.map((row) => {
    const list = byEntity.get(idOf(row) as string);
    if (!list) return row;
    // Clone so we never mutate cached query results. Content rows are plain JSON
    // (strings, string arrays, nested option/anchor objects) so a structured clone
    // via JSON round-trip is correct and cheap.
    const next = JSON.parse(JSON.stringify(row)) as AnyRow;
    for (const { field, value } of list) applyField(next, field, value);
    return next as T;
  });
}

// Convenience for single-row reads (bySlug, currentQuizRound). Returns the row (or
// null) with translations overlaid.
export async function overlayOne<T>(
  supabase: SupabaseClient,
  locale: Locale,
  entityType: string,
  row: T | null,
  opts?: { idKey?: keyof T },
): Promise<T | null> {
  if (!row) return row;
  const [overlaid] = await overlayTranslations(supabase, locale, entityType, [row], opts);
  return overlaid ?? row;
}
