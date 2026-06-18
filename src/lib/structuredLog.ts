type LiveEvent =
  | "rundown.created"
  | "rundown.block_activated"
  | "rundown.block_closed"
  | "rundown.block_revealed"
  | "rundown.response_submitted"
  | "rundown.publication_changed"
  | "rundown.consent_changed"
  | "rundown.session_ended"
  | "rundown.rpc_error";

type SafeFields = Record<string, string | number | boolean | null | undefined>;

// Operational metadata only. Callers must never pass codes, names, answer
// payloads, response text, auth tokens, or CAPTCHA values.
export function logLiveEvent(event: LiveEvent, fields: SafeFields = {}) {
  console.info(JSON.stringify({ event, at: new Date().toISOString(), ...fields }));
}
