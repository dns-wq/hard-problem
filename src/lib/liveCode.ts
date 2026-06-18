// Live session join-code format — single source of truth for the TS side.
// The DB CHECK constraint in supabase/migrations/005_live_sessions.sql is a
// necessary copy; keep the three in sync.
// No 0/O/1/I/L — unambiguous when read off a projector.
export const LIVE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const LIVE_CODE_REGEX = /^[A-HJ-KM-NP-Z2-9]{6}$/;
