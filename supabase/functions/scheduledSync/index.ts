import { google } from "npm:googleapis@140";
import { createClient } from "npm:@supabase/supabase-js@2";

const SPREADSHEET_ID = "1MWP5PPNgZ2HmA0XnPfPM32Gu9USQofLhSTWl8JbwS_k";

const ENTITY_TABLES: Record<string, string> = {
  VanaLead: "vana_leads",
  MatchTalkLead: "matchtalk_leads",
  GreenFormLead: "greenform_leads",
};

const SHEET_CONFIG = {
  GreenFormLead: { sheetName: "Live Green Form Data", uniqueKey: "opportunity_name" },
  MatchTalkLead: { sheetName: "Match Stock", uniqueKey: "phone_number" },
  VanaLead: { sheetName: "VNA Next Allocation", uniqueKey: "opty_id" },
};

const FIELD_MAPS = {
  GreenFormLead: {
    "PPL": "ppl", "Source(PV)": "source_pv", "Source (PV)": "source_pv",
    "Mobile No": "phone_number", "Created Date": "created_date",
    "Employee Full Name": "employee_full_name", "Sales Stage": "sales_stage",
    "Full Name": "customer_name", "Opportunity Name": "opportunity_name",
    "TL Name": "tl_name", "Branch": "branch", "Total Offers": "total_offers",
    "EVorPV": "ev_or_pv", "EV or PV": "ev_or_pv", "Month": "month",
    "WA 1": "wa_1", "WA 2": "wa_2", "WA 3": "wa_3", "WA 4": "wa_4",
    "Next Message Date": "next_message_date", "WA V1": "wa_v1", "WA V2": "wa_v2",
    "WA V3": "wa_v3", "WA V4": "wa_v4", "Remarks": "remarks", "MTD": "mtd",
  },
  MatchTalkLead: {
    "Chassis No": "chassis_no", "PPL": "ppl", "PL": "pl", "Colour": "colour",
    "CA Name as per App": "ca_name", "Full Name": "customer_name",
    "Mobile No": "phone_number", "No Status": "no_status", "VC #": "vc_number",
    "Finance Remark": "finance_remark", "Opty Id": "opty_id",
  },
  VanaLead: {
    "Booking ID": "booking_id", "Chassis No": "chassis_no", "PPL": "ppl",
    "PL": "pl", "Colour": "colour", "App CA Name": "ca_name", "Opty Id": "opty_id",
    "First Name": "customer_name", "VC #": "vc_number", "YF Open Date": "yf_open_date",
    "Mobile No": "phone_number", "Branch": "branch", "TL Name": "tl_name",
    "Allocation Status": "allocation_status",
  },
};

async function fetchSheetData(accessToken: any, sheetName: string) {
  // accessToken kept for backward-compat in signature; no longer used.
  void accessToken;
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: sheetName,
  });
  return res.data.values || [];
}

function getEnv(name: string): string | undefined {
  return Deno.env.get(name) || (globalThis as any)?.process?.env?.[name] || undefined;
}

function requiredEnv(name: string): string {
  const val = getEnv(name);
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

function getSheetsClient() {
  const clientEmail = requiredEnv("GOOGLE_CLIENT_EMAIL");
  const privateKeyRaw = requiredEnv("GOOGLE_PRIVATE_KEY");
  const privateKey = privateKeyRaw.includes("\\n") ? privateKeyRaw.replace(/\\n/g, "\n") : privateKeyRaw;

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return google.sheets({ version: "v4", auth });
}

function getSupabaseAdmin() {
  const url = requiredEnv("SUPABASE_URL");
  const serviceRoleKey =
    getEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    getEnv("SUPABASE_SERVICE_ROLE") ||
    getEnv("SUPABASE_SERVICE_KEY");
  if (!serviceRoleKey) throw new Error("Missing env var: SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceRoleKey);
}

function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

async function isAuthorizedRequest(req: Request, supabaseAdmin: ReturnType<typeof createClient>) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const token = getBearerToken(authHeader);
  if (!token) return false;

  const serviceRoleKey =
    getEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    getEnv("SUPABASE_SERVICE_ROLE") ||
    getEnv("SUPABASE_SERVICE_KEY");
  if (serviceRoleKey && token === serviceRoleKey) return true;

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) return false;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== "admin") return false;
  return true;
}

function parseRows(values: any[], entityName: keyof typeof FIELD_MAPS) {
  if (!values || values.length < 2) return [];
  const headers = values[0];
  const fieldMap = (FIELD_MAPS as any)[entityName];
  return values
    .slice(1)
    .map((row) => {
      const record: Record<string, any> = {};
      headers.forEach((header: string, i: number) => {
        const fieldName = fieldMap[header];
        if (fieldName && row[i] !== undefined && row[i] !== "") record[fieldName] = row[i];
      });
      return record;
    })
    .filter((r) => Object.keys(r).length > 0);
}

function buildDedupKey(record: any): string | null {
  const opty = (record?.opty_id ?? "").toString().trim();
  if (opty) return `opty_id:${opty}`;
  const vc = (record?.vc_number ?? "").toString().trim();
  if (vc) return `vc_number:${vc}`;
  const opp = (record?.opportunity_name ?? "").toString().trim();
  if (opp) return `opportunity_name:${opp}`;
  const phone = (record?.phone_number ?? "").toString().trim();
  if (phone) return `phone_number:${phone}`;
  return null;
}

async function syncEntity(supabaseAdmin: any, entityName: keyof typeof SHEET_CONFIG) {
  const config = (SHEET_CONFIG as any)[entityName];
  const values = await fetchSheetData(null, config.sheetName);
  const rows = parseRows(values, entityName as any);
  if (rows.length === 0) return { created: 0, updated: 0, skipped: 0 };

  const table = ENTITY_TABLES[entityName];
  if (!table) throw new Error(`Unknown entity: ${entityName}`);

  const { data: existing, error: existingError } = await supabaseAdmin
    .from(table)
    .select("*")
    .range(0, 9999);
  if (existingError) throw new Error(existingError.message);

  const existingMap: Record<string, any> = {};
  (existing ?? []).forEach((r: any) => {
    const primary = (r?.[config.uniqueKey] ?? "").toString().trim();
    if (primary) existingMap[`${config.uniqueKey}:${primary}`] = r;

    const dedup = buildDedupKey(r);
    if (dedup) existingMap[dedup] = r;

    const phone = (r?.phone_number ?? "").toString().trim();
    if (phone) existingMap[`phone_number:${phone}`] = r;
    const vc = (r?.vc_number ?? "").toString().trim();
    if (vc) existingMap[`vc_number:${vc}`] = r;
    const opp = (r?.opportunity_name ?? "").toString().trim();
    if (opp) existingMap[`opportunity_name:${opp}`] = r;
    const opty = (r?.opty_id ?? "").toString().trim();
    if (opty) existingMap[`opty_id:${opty}`] = r;
  });

  let skipped = 0;
  const newRows: any[] = [];
  const updateRows: any[] = [];

  rows.forEach((row: any) => {
    const uniqueVal = (row?.[config.uniqueKey] ?? "").toString().trim();
    if (!uniqueVal || !row.customer_name || !row.phone_number) {
      skipped++;
      return;
    }

    const candidates = [
      `${config.uniqueKey}:${uniqueVal}`,
      buildDedupKey(row),
      row.opty_id ? `opty_id:${row.opty_id}` : null,
      row.vc_number ? `vc_number:${row.vc_number}` : null,
      row.opportunity_name ? `opportunity_name:${row.opportunity_name}` : null,
      row.phone_number ? `phone_number:${row.phone_number}` : null,
    ].filter(Boolean) as string[];

    const existingRow = candidates.map((k) => existingMap[k]).find(Boolean);
    if (existingRow) {
      updateRows.push({ id: existingRow.id, ...row });
    } else {
      newRows.push(row);
    }
  });

  const BATCH = 50;
  let created = 0;
  let updated = 0;

  const upsertBatches = async (payload: any[], countAs: "created" | "updated") => {
    for (let i = 0; i < payload.length; i += BATCH) {
      const batch = payload.slice(i, i + BATCH);
      const { error } = await supabaseAdmin.from(table).upsert(batch, { onConflict: "id" });
      if (error) throw new Error(error.message);
      if (countAs === "created") created += batch.length;
      else updated += batch.length;
    }
  };

  await upsertBatches(newRows, "created");
  await upsertBatches(updateRows, "updated");

  return { created, updated, skipped };
}

Deno.serve(async (req) => {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const isAuthorized = await isAuthorizedRequest(req, supabaseAdmin);
    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const results: Record<string, any> = {};
    for (const entityName of ["VanaLead", "MatchTalkLead", "GreenFormLead"] as const) {
      results[entityName] = await syncEntity(supabaseAdmin, entityName);
      console.log(`Synced ${entityName}:`, results[entityName]);
      await new Promise((r) => setTimeout(r, 3000));
    }

    return Response.json({ message: "All synced successfully", results });
  } catch (error: any) {
    console.error("Scheduled sync error:", error?.message ?? error);
    return Response.json({ error: error?.message ?? String(error) }, { status: 500 });
  }
});
