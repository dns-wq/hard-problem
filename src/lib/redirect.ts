// Sanitizes a post-auth ?redirect= value. Only same-origin relative paths are
// allowed: must start with "/", must not start with "//" (protocol-relative),
// and must not contain "\" (browsers normalize "\" to "/", enabling
// "/\evil.com" bypasses). Anything else falls back to the default.
// Used by /auth/login, /auth/signup (client) and /auth/callback (server) —
// the server-side check is the load-bearing one.
export function safeRedirect(value: string | null | undefined, fallback = "/topics"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  return value;
}
