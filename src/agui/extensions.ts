/*
 * HAS (Health Agent Service) extensions to the AG-UI protocol.
 *
 * Health Bot injects one extension field this sample reads today: `toolProgress`, a
 * human-readable progress line placed on TOOL_CALL_START events.
 *
 * HAS also defines extra event TYPES (e.g. TOOL_CALL_STREAM, SAFEGUARDS_UPDATE in the
 * Orchestrator's extended_agui_events.py). This sample does NOT act on them yet, so —
 * by design — they are not modelled here; the registry's safe default handles them
 * cleanly. When one needs a UI behaviour, model it then and register one entry.
 */

/**
 * Extension bag carried on core events (currently TOOL_CALL_START). Open by design:
 * `toolProgress` is the one field this sample reads, but Health Bot may inject others,
 * and unknown keys must never break parsing.
 */
export interface EventExtensions {
  /** Human-readable progress line shown to the user while a tool runs. */
  toolProgress?: string;
  [key: string]: unknown;
}
