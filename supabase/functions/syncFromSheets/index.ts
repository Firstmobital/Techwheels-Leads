import { google } from "npm:googleapis@140";
import { createClient } from "npm:@supabase/supabase-js@2";

const SPREADSHEET_ID = "1MWP5PPNgZ2HmA0XnPfPM32Gu9USQofLhSTWl8JbwS_k";

const ENTITY_TABLES = {
  VanaLead: "vana_leads",
  MatchTalkLead: "matchtalk_leads",
  GreenFormLead: "greenform_leads",
} as const;

type EntityName = keyof typeof ENTITY_TABLES;

const SHEET_CONFIG = {
  GreenFormLead: {
    sheetName: "Live Green Form Data",
    leadIdCandidates: ["opportunity_name", "phone_number"],
  },
  MatchTalkLead: {
    sheetName: "Match Stock",
    leadIdCandidates: [
      "chassis_no",
      "opty_id",
      "vc",
      "vc_number",
      "mobile_no",
      "phone_number",
    ],
  },
  VanaLead: {
    sheetName: "VNA Next Allocation",
    leadIdCandidates: ["opty_id", "vc_number", "phone_number"],
  },
} as const;

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

const FIELD_MAPS = {
  GreenFormLead: {
    "PPL": "ppl",
    "Source(PV)": "source_pv",
    "Source (PV)": "source_pv",
    "Mobile No": "phone_number",
    "Created Date": "created_date",
    "Employee Full Name": "employee_full_name",
    "Sales Stage": "sales_stage",
    "Full Name": "customer_name",
    "Opportunity Name": "opportunity_name",
    "TL Name": "tl_name",
    "Branch": "branch",
    "Total Offers": "total_offers",
    "EVorPV": "ev_or_pv",
    "EV or PV": "ev_or_pv",
    "Month": "month",
    "WA 1": "wa_1",
    "WA 2": "wa_2",
    "WA 3": "wa_3",
    "WA 4": "wa_4",
    "Next Message Date": "next_message_date",
    "WA V1": "wa_v1",
    "WA V2": "wa_v2",
    "WA V3": "wa_v3",
    "WA V4": "wa_v4",
    "Remarks": "remarks",
    "MTD": "mtd",
  },

  MatchTalkLead: {
    "Chassis No": "chassis_no",
    "Chassis No.": "chassis_no",
    "Chassis Number": "chassis_no",
    "PPL": "ppl",
    "PL": "pl",
    "Colour": "colour",
    "COLOUR": "colour",
    "CA Name as per App": "ca_name",
    "CA Name": "ca_name",
    "CA Name-as per App": "ca_name",
    "Full Name": "customer_name",
    "Customer Name": "customer_name",
    "Name": "customer_name",
    "Mobile No": "phone_number",
    "Mobile": "phone_number",
    "Phone": "phone_number",
    "No Status": "no_status",
    "VC #": "vc_number",
    "VC#": "vc_number",
    "VC No": "vc_number",
    "Opty Id": "opty_id",
    "Opty ID": "opty_id",
    "Opportunity Id": "opty_id",
    "Finance Remark": "finance_remark",
    "WA 1": "wa_1",
    "WA 2": "wa_2",
    "Next Message Date": "next_message_date",
    "WA V1": "wa_v1",
    "WA V2": "wa_v2",
    "Remarks": "remarks",
  },

  VanaLead: {
    "Booking ID": "booking_id",
    "Chassis No": "chassis_no",
    "Chassis No.": "chassis_no",
    "PPL": "ppl",
    "PL": "pl",
    "Colour": "colour",
    "App CA Name": "ca_name",
    "Opty Id": "opty_id",
    "First Name": "customer_name",
    "VC #": "vc_number",
    "VC#": "vc_number",
    "YF Open Date": "yf_open_date",
    "Mobile No": "phone_number",
    "Branch": "branch",
    "TL Name": "tl_name",
    "Allocation Status": "allocation_status",
  },
};

function requiredEnv(name: string): string {
  const val = Deno.env.get(name);
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

requiredEnv("SUPABASE_URL");
requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
requiredEnv("GOOGLE_CLIENT_EMAIL");
requiredEnv("GOOGLE_PRIVATE_KEY");

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const GOOGLE_CLIENT_EMAIL = Deno.env.get("GOOGLE_CLIENT_EMAIL")!;
const GOOGLE_PRIVATE_KEY = Deno.env.get("GOOGLE_PRIVATE_KEY")!;

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: GOOGLE_CLIENT_EMAIL,
    private_key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const sheets = google.sheets({ version: "v4", auth });

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function getServiceRoleKey(): string | null {
  return (
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE") ||
    Deno.env.get("SUPABASE_SERVICE_KEY") ||
    null
  );
}

async function isAuthorizedRequest(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const token = getBearerToken(authHeader);
  if (!token) return false;

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  return !(userError || !userData?.user);
}

async function fetchSheetData(sheetName: string) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: sheetName,
  });
  return res.data.values || [];
}

function normalizeHeader(h: string) {
  return h.trim().replace(/\s+/g, " ");
}

function parseRows(values: any[], entityName: EntityName) {
  if (values.length < 2) return [];

  const headers = values[0].map(normalizeHeader);
  const fieldMap = FIELD_MAPS[entityName] as Record<string, string>;

  return values
    .slice(1)
    .map((row) => {
      const record: Record<string, any> = {};

      headers.forEach((header: string, i: number) => {
        const field = fieldMap[header];
        const val = (row[i] || "").toString().trim();

        if (field && val) {
          record[field] = val;
        }
      });

      return record;
    })
    .filter((r) => Object.keys(r).length > 0);
}

function normalizeLeadIdValue(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildLeadId(entityName: EntityName, row: Record<string, any>): string | null {
  const candidates = SHEET_CONFIG[entityName].leadIdCandidates;
  for (const candidate of candidates) {
    const raw = row?.[candidate];
    const normalized = normalizeLeadIdValue(raw);
    if (normalized) {
      return `${entityName}:${candidate}:${normalized}`;
    }
  }
  return null;
}

function dedupeByLeadId(rows: Record<string, any>[]) {
  const map = new Map<string, Record<string, any>>();
  for (const row of rows) {
    if (!row.lead_id) continue;
    map.set(row.lead_id, row);
  }
  return Array.from(map.values());
}

async function createSyncLog(entityName: EntityName, startedAt: string) {
  const { data, error } = await supabaseAdmin
    .from("sync_logs")
    .insert({
      entity: entityName,
      started_at: startedAt,
      status: "running",
    })
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`sync_logs insert failed: ${error.message}`);
  return data?.id ?? null;
}

async function finishSyncLog(logId: string | null, payload: any) {
  if (!logId) return;
  const { error } = await supabaseAdmin.from("sync_logs").update(payload).eq("id", logId);

  // Backward compatibility: some environments may not have duration_ms yet.
  if (error && payload?.duration_ms !== undefined && /duration_ms|column/i.test(error.message)) {
    const { duration_ms, ...fallbackPayload } = payload;
    const { error: fallbackError } = await supabaseAdmin
      .from("sync_logs")
      .update(fallbackPayload)
      .eq("id", logId);

    if (fallbackError) {
      throw new Error(`sync_logs update failed: ${fallbackError.message}`);
    }
    return;
  }

  if (error) {
    throw new Error(`sync_logs update failed: ${error.message}`);
  }
}

async function syncEntity(entityName: EntityName) {
  const table = ENTITY_TABLES[entityName];
  const sheetName = SHEET_CONFIG[entityName].sheetName;
  const startedAtDate = new Date();
  const startedAt = startedAtDate.toISOString();
  const startedAtMs = startedAtDate.getTime();
  const logId = await createSyncLog(entityName, startedAt);

  let rowsProcessed = 0;
  let rowsInserted = 0;
  let rowsUpdated = 0;
  let rowsSkipped = 0;

  try {
    const values = await fetchSheetData(sheetName);
    const parsed = parseRows(values, entityName);
    rowsProcessed = parsed.length;
    const withLeadId = parsed
      .map((row) => ({ ...row, lead_id: buildLeadId(entityName, row) }))
      .filter((row) => {
        if (!row.lead_id) {
          console.warn("Dropped row without lead_id:", row);
          return false;
        }
        return true;
      });
    const payload = dedupeByLeadId(withLeadId);

    const skipped = parsed.length - payload.length;
    rowsSkipped = skipped;

    let existingLeadIds = new Set<string>();
    if (payload.length > 0) {
      const ids = payload.map((r) => r.lead_id as string);
      const CHUNK = 500;

      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const { data, error } = await supabaseAdmin
          .from(table)
          .select("lead_id")
          .in("lead_id", chunk);

        if (error) throw new Error(`Existing lead lookup failed: ${error.message}`);
        (data ?? []).forEach((r: any) => {
          if (r?.lead_id) existingLeadIds.add(r.lead_id);
        });
      }

      const UPSERT_CHUNK = 200;
      for (let i = 0; i < payload.length; i += UPSERT_CHUNK) {
        const batch = payload.slice(i, i + UPSERT_CHUNK);
        const { error } = await supabaseAdmin
          .from(table)
          .upsert(batch, { onConflict: "lead_id" });

        if (error) throw new Error(`Upsert failed: ${error.message}`);
      }
    }

    const updated = payload.filter((r) => existingLeadIds.has(r.lead_id)).length;
    const inserted = payload.length - updated;
    rowsUpdated = updated;
    rowsInserted = inserted;

    const finishedAtDate = new Date();
    const finishedAt = finishedAtDate.toISOString();
    const durationMs = finishedAtDate.getTime() - startedAtMs;

    await finishSyncLog(logId, {
      finished_at: finishedAt,
      rows_processed: rowsProcessed,
      rows_inserted: rowsInserted,
      rows_updated: rowsUpdated,
      rows_skipped: rowsSkipped,
      duration_ms: durationMs,
      status: "success",
      error_message: null,
    });

    return {
      entity: entityName,
      table,
      sheet: sheetName,
      log_id: logId,
      rows_processed: rowsProcessed,
      rows_inserted: rowsInserted,
      rows_updated: rowsUpdated,
      rows_skipped: rowsSkipped,
      status: "success",
    };
  } catch (error: any) {
    const finishedAtDate = new Date();
    const finishedAt = finishedAtDate.toISOString();
    const durationMs = finishedAtDate.getTime() - startedAtMs;

    await finishSyncLog(logId, {
      finished_at: finishedAt,
      rows_processed: rowsProcessed,
      rows_inserted: rowsInserted,
      rows_updated: rowsUpdated,
      rows_skipped: rowsSkipped,
      duration_ms: durationMs,
      status: "failed",
      error_message: error?.message ?? String(error),
    });

    return {
      entity: entityName,
      table,
      sheet: sheetName,
      log_id: logId,
      status: "failed",
      error: error?.message ?? String(error),
    };
  }
}

function parseRequestedEntities(body: any): EntityName[] {
  const entity = body?.entity;
  const entities = body?.entities;

  if (typeof entity === "string") {
    if (!(entity in ENTITY_TABLES)) throw new Error("Invalid entity");
    return [entity as EntityName];
  }

  if (Array.isArray(entities) && entities.length > 0) {
    const valid = entities.filter((e) => typeof e === "string" && e in ENTITY_TABLES) as EntityName[];
    if (valid.length === 0) throw new Error("Invalid entities");
    return valid;
  }

  return Object.keys(ENTITY_TABLES) as EntityName[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  const isAuthorized = await isAuthorizedRequest(req);
  if (!isAuthorized) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS,
        },
      },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const requestedEntities = parseRequestedEntities(body);

    const results = [];
    for (const entityName of requestedEntities) {
      const result = await syncEntity(entityName);
      results.push(result);
    }

    const hasFailure = results.some((r) => r.status === "failed");
    const status = hasFailure ? 207 : 200;

    return jsonResponse({
      message: hasFailure ? "Sync completed with partial failures" : "Sync complete",
      results,
    }, { status });
  } catch (err: any) {
    return jsonResponse({ error: err?.message ?? String(err) }, { status: 500 });
  }
});
