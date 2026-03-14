import { createClient } from "npm:@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// submitAILead — Chatbot-to-Operational DB handoff endpoint
//
// PURPOSE:
//   When the Chatbot App (DB: ategzitpearytlbncdzk) qualifies a conversation
//   as an interested lead, it calls this Edge Function to insert a record into
//   the Operational DB's `ai_leads` table.
//
// CALLER:
//   The Chatbot App backend. Must present a pre-shared CHATBOT_API_KEY in the
//   Authorization header as: "Bearer <CHATBOT_API_KEY>".
//   This keeps the chatbot out of the auth.users JWT flow entirely.
//
// IDEMPOTENCY:
//   Keyed on source_conversation_id (UNIQUE). Duplicate calls for the same
//   conversation are silently accepted and return the existing record.
//   This makes the handoff safe to retry without creating duplicate leads.
//
// REQUIRED ENV VARS:
//   SUPABASE_URL                — Operational DB URL
//   SUPABASE_SERVICE_ROLE_KEY   — Operational DB service-role key
//   CHATBOT_API_KEY             — Pre-shared secret for chatbot auth
//
// MINIMUM REQUIRED PAYLOAD FIELDS:
//   customer_name         TEXT  — customer's name from the conversation
//   mobile_number         TEXT  — E.164-normalizable phone number
//   source_conversation_id TEXT — unique ID of the chatbot conversation
//
// OPTIONAL PAYLOAD FIELDS:
//   model_name            TEXT  — car model the customer expressed interest in
//   remarks               TEXT  — summary of conversation intent
//   location_id           UUID  — dealership location (if known)
//   salesperson_id        UUID  — assigned employee (typically null on handoff)
// ---------------------------------------------------------------------------

function requiredEnv(name: string): string {
  const val = Deno.env.get(name);
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

requiredEnv("SUPABASE_URL");
requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
requiredEnv("CHATBOT_API_KEY");

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...(init.headers ?? {}),
    },
  });
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

/**
 * Authenticate via a constant-time comparison against the pre-shared CHATBOT_API_KEY.
 * No JWT validation needed — chatbot is a server-to-server caller.
 */
function isAuthorized(req: Request): boolean {
  const token = getBearerToken(req);
  if (!token) return false;
  const expected = Deno.env.get("CHATBOT_API_KEY") ?? "";
  // Constant-time comparison to prevent timing oracle.
  if (token.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Normalize a phone number to digits-only, stripping spaces, dashes, parens.
 * Does not enforce E.164 — accepts partial numbers to avoid dropping leads.
 */
function normalizeMobileNumber(raw: unknown): string | null {
  const str = String(raw ?? "").trim();
  const digits = str.replace(/[^\d+]/g, "");
  return digits.length >= 7 ? digits : null;
}

function isNonEmptyString(val: unknown): val is string {
  return typeof val === "string" && val.trim().length > 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  if (!isAuthorized(req)) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }

  // --- Validate required fields ---
  const customerName = isNonEmptyString(body.customer_name) ? body.customer_name.trim() : null;
  const sourceConversationId = isNonEmptyString(body.source_conversation_id)
    ? body.source_conversation_id.trim()
    : null;
  const mobileNumber = normalizeMobileNumber(body.mobile_number);

  const errors: string[] = [];
  if (!customerName) errors.push("customer_name is required and must be a non-empty string");
  if (!sourceConversationId) errors.push("source_conversation_id is required and must be a non-empty string");
  if (!mobileNumber) errors.push("mobile_number is required and must contain at least 7 digits");

  if (errors.length > 0) {
    return jsonResponse({ error: "Validation failed", details: errors }, { status: 422 });
  }

  // --- Build insert payload ---
  const payload: Record<string, unknown> = {
    customer_name: customerName,
    mobile_number: mobileNumber,
    source_conversation_id: sourceConversationId!,
    // Operational defaults for a fresh chatbot-originated lead:
    greenform_requested: false,
    opty_status: "pending",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Optional fields — only set if non-empty to avoid overwriting DB defaults with nulls.
  if (isNonEmptyString(body.model_name)) payload.model_name = body.model_name.trim();
  if (isNonEmptyString(body.remarks)) payload.remarks = body.remarks.trim();

  // UUIDs — validate format before inserting.
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (isNonEmptyString(body.location_id) && uuidRegex.test(body.location_id.trim())) {
    payload.location_id = body.location_id.trim();
  }
  if (isNonEmptyString(body.salesperson_id) && uuidRegex.test(body.salesperson_id.trim())) {
    payload.salesperson_id = body.salesperson_id.trim();
  }

  // --- Idempotent upsert on source_conversation_id ---
  // If the chatbot retries for the same conversation, we return the existing record
  // without creating a duplicate. This is safe because a conversation can only
  // ever produce one qualified lead.
  const { data, error } = await supabaseAdmin
    .from("ai_leads")
    .upsert(payload, {
      onConflict: "source_conversation_id",
      ignoreDuplicates: false, // Return the existing row if already inserted.
    })
    .select("id, customer_name, mobile_number, model_name, source_conversation_id, opty_status, created_at")
    .maybeSingle();

  if (error) {
    console.error("submitAILead upsert error:", error);
    return jsonResponse({ error: error.message }, { status: 500 });
  }

  return jsonResponse(
    {
      message: "AI lead submitted successfully",
      lead: data,
    },
    { status: 201 },
  );
});
