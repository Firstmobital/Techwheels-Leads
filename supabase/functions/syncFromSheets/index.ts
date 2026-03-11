import { google } from "npm:googleapis@140";
import { createClient } from "npm:@supabase/supabase-js@2";

// Sheet ID for Vana, MatchTalk, GreenForm data
const SPREADSHEET_ID = "1MWP5PPNgZ2HmA0XnPfPM32Gu9USQofLhSTWl8JbwS_k";

const ENTITY_TABLES: Record<string, string> = {
  VanaLead: "vana_leads",
  MatchTalkLead: "matchtalk_leads",
  GreenFormLead: "greenform_leads",
};

const SHEET_CONFIG = {
  GreenFormLead: {
    sheetName: "Live Green Form Data",
    uniqueKey: "opportunity_name",
  },
  MatchTalkLead: {
    sheetName: "Match Stock",
    uniqueKey: "vc_number",
  },
  VanaLead: {
    sheetName: "VNA Next Allocation",
    uniqueKey: "opty_id",
  },
};

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

// Validate required env vars at cold start.
requiredEnv("SUPABASE_URL");
requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
requiredEnv("GOOGLE_CLIENT_EMAIL");
requiredEnv("GOOGLE_PRIVATE_KEY");

// Trusted server-side Supabase client (no user JWT required).
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Google Sheets client using service account credentials.
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

async function fetchSheetData(accessToken: any, sheetName: string) {
  // accessToken kept for backward-compat in signature; no longer used.
  void accessToken;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: sheetName,
  });
  return res.data.values || [];
}

function normalizeHeader(h: string) {
  return h.trim().replace(/\s+/g, " ");
}

function parseRows(values: any[], entityName: keyof typeof FIELD_MAPS) {
  if (values.length < 2) return [];

  const headers = values[0].map(normalizeHeader);
  const fieldMap = (FIELD_MAPS as any)[entityName];

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

Deno.serve(async (req) => {
  let logId: string | null = null;
  let entityName: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    entityName = body.entity;

    if (!(SHEET_CONFIG as any)[entityName]) {
      return Response.json({ error: "Invalid entity" }, { status: 400 });
    }

    const config = (SHEET_CONFIG as any)[entityName];

    // Start sync log (best-effort; never blocks sync).
    try {
      const { data: logRow, error: logError } = await supabaseAdmin
        .from("sync_logs")
        .insert({ entity: entityName, started_at: new Date().toISOString(), status: "running" })
        .select("id")
        .maybeSingle();
      if (!logError && logRow?.id) logId = logRow.id;
    } catch {
      // ignore logging errors
    }

    const values = await fetchSheetData(null, config.sheetName);

    const rows = parseRows(values, entityName);

    const table = ENTITY_TABLES[entityName];
    if (!table) {
      return Response.json({ error: `Unknown entity: ${entityName}` }, { status: 400 });
    }

    // Database-side deduplication: rely on a UNIQUE constraint/index on config.uniqueKey.
    // Skip rows missing the unique key to avoid inserting duplicates (NULLs are not equal).
    const uniqueKey = config.uniqueKey as string;
    const validRows = rows.filter((r: any) => (r?.[uniqueKey] ?? "").toString().trim());
    const skipped = rows.length - validRows.length;

    if (validRows.length > 0) {
      const { error } = await supabaseAdmin
        .from(table)
        .upsert(validRows, { onConflict: uniqueKey, count: "exact" });

      if (error) throw new Error(error.message);
    }

    // With DB-side upsert we don't compute inserted-vs-updated counts without extra queries.
    const created = validRows.length;
    const updated = 0;

    // Finish sync log (best-effort).
    if (logId) {
      try {
        await supabaseAdmin
          .from("sync_logs")
          .update({
            finished_at: new Date().toISOString(),
            rows_processed: rows.length,
            rows_inserted: created,
            rows_updated: updated,
            rows_skipped: skipped,
            status: "success",
          })
          .eq("id", logId);
      } catch {
        // ignore logging errors
      }
    }

    return Response.json({
      message: "Sync complete",
      log_id: logId,
      created,
      updated,
      skipped,
      totalSheetRows: rows.length,
    });
  } catch (err: any) {
    // Mark sync log as failed (best-effort).
    if (logId) {
      try {
        await supabaseAdmin
          .from("sync_logs")
          .update({
            finished_at: new Date().toISOString(),
            status: "failed",
            error_message: err?.message ?? String(err),
          })
          .eq("id", logId);
      } catch {
        // ignore logging errors
      }
    }

    return Response.json({ error: err?.message ?? String(err), log_id: logId }, { status: 500 });
  }
});
