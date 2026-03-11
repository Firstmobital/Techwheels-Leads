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

const SKIP_COMPARE = new Set([
  "id",
  "created_date",
  "updated_date",
  "created_by",
  "assigned_to",
  "notes",
]);

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

async function fetchSheetData(accessToken, sheetName) {
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
  return (
    Deno.env.get(name) ||
    (globalThis as any)?.process?.env?.[name] ||
    undefined
  );
}

function requiredEnv(name: string): string {
  const val = getEnv(name);
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

function getSheetsClient() {
  const clientEmail = requiredEnv("GOOGLE_CLIENT_EMAIL");
  const privateKeyRaw = requiredEnv("GOOGLE_PRIVATE_KEY");
  const privateKey = privateKeyRaw.includes("\\n")
    ? privateKeyRaw.replace(/\\n/g, "\n")
    : privateKeyRaw;

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

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

async function assertAdmin(req: Request, supabaseAdmin: ReturnType<typeof createClient>) {
  const token = getBearerToken(req);
  if (!token) {
    return { ok: false as const, status: 401, error: "Missing Authorization Bearer token" };
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return { ok: false as const, status: 401, error: "Invalid or expired token" };
  }

  const userId = userData.user.id;
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    return { ok: false as const, status: 500, error: profileError.message };
  }

  if (!profile || profile.role !== "admin") {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return { ok: true as const, userId };
}

function normalizeHeader(h) {
  return h.trim().replace(/\s+/g, " ");
}

function parseRows(values, entityName) {
  if (values.length < 2) return [];

  const headers = values[0].map(normalizeHeader);
  const fieldMap = FIELD_MAPS[entityName];

  return values.slice(1).map(row => {
    const record = {};

    headers.forEach((header, i) => {
      const field = fieldMap[header];
      const val = (row[i] || "").toString().trim();

      if (field && val) {
        record[field] = val;
      }
    });

    return record;
  }).filter(r => Object.keys(r).length > 0);
}

function hasChanges(existing, sheetRow) {
  return Object.keys(sheetRow).some(k => {
    if (SKIP_COMPARE.has(k)) return false;

    const a = (existing[k] || "").toString().trim();
    const b = (sheetRow[k] || "").toString().trim();

    return a !== b;
  });
}

Deno.serve(async req => {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const adminCheck = await assertAdmin(req, supabaseAdmin);
    if (!adminCheck.ok) {
      return Response.json({ error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = await req.json().catch(() => ({}));
    const entityName = body.entity;

    if (!SHEET_CONFIG[entityName]) {
      return Response.json(
        { error: "Invalid entity" },
        { status: 400 }
      );
    }

    const config = SHEET_CONFIG[entityName];

    const values = await fetchSheetData(null, config.sheetName);

    console.log("Sheet rows:", values.length);
    console.log("Sheet headers:", values[0]);

    const rows = parseRows(values, entityName);

    console.log("Parsed rows:", rows.length);
    if (rows.length > 0) console.log("Sample row:", rows[0]);

    const table = ENTITY_TABLES[entityName];
    if (!table) {
      return Response.json({ error: `Unknown entity: ${entityName}` }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from(table)
      .select("*")
      .range(0, 9999);

    if (existingError) {
      throw new Error(existingError.message);
    }

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

    const newRows = [];
    const updateRows = [];

    let skipped = 0;

    for (const row of rows) {
      const key = (row?.[config.uniqueKey] ?? "").toString().trim();

      if (!key) {
        skipped++;
        continue;
      }

      const candidates = [
        `${config.uniqueKey}:${key}`,
        buildDedupKey(row),
        row.opty_id ? `opty_id:${row.opty_id}` : null,
        row.vc_number ? `vc_number:${row.vc_number}` : null,
        row.opportunity_name ? `opportunity_name:${row.opportunity_name}` : null,
        row.phone_number ? `phone_number:${row.phone_number}` : null,
      ].filter(Boolean) as string[];

      const existingRow = candidates.map(k => existingMap[k]).find(Boolean);

      if (!existingRow) {
        newRows.push(row);
      } else if (hasChanges(existingRow, row)) {
        updateRows.push({ id: existingRow.id, ...row });
      } else {
        skipped++;
      }
    }

    console.log("Create:", newRows.length);
    console.log("Update:", updateRows.length);
    console.log("Skipped:", skipped);

    const BATCH = 50;

    let created = 0;
    let updated = 0;

    const upsertInBatches = async (payload: any[], countAs: "created" | "updated") => {
      for (let i = 0; i < payload.length; i += BATCH) {
        const batch = payload.slice(i, i + BATCH);
        try {
          const { error } = await supabaseAdmin.from(table).upsert(batch, { onConflict: "id" });
          if (error) throw error;
          if (countAs === "created") created += batch.length;
          else updated += batch.length;
        } catch (e: any) {
          console.log("Batch upsert failed, trying individual rows:", e?.message ?? e);
          for (const row of batch) {
            try {
              const { error } = await supabaseAdmin.from(table).upsert([row], { onConflict: "id" });
              if (error) throw error;
              if (countAs === "created") created++;
              else updated++;
            } catch (rowErr: any) {
              console.log("Row skipped:", row, rowErr?.message ?? rowErr);
              skipped++;
            }
          }
        }
      }
    };

    await upsertInBatches(newRows, "created");
    await upsertInBatches(updateRows, "updated");

    return Response.json({
      message: "Sync complete",
      created,
      updated,
      skipped,
      totalSheetRows: rows.length,
    });

  } catch (err) {
    console.error(err);

    return Response.json(
      { error: err.message },
      { status: 500 }
    );
  }
});