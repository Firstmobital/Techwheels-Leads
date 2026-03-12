import { google } from "npm:googleapis@140";
import { createClient } from "npm:@supabase/supabase-js@2";

const SPREADSHEET_ID =
  Deno.env.get("GOOGLE_SHEET_ID_AI_LEADS") ||
  "1YbAJFJHshygUFs0nYfaYQu9ig4KDTSqnIuaf1tY6gdo";

const FIELD_MAP: Record<string, string> = {
  customer_name: "customer_name",
  phone_number: "phone_number",
  car_of_interest: "car_of_interest",
  chat_details: "chat_details",
};

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
  const auth = authHeader;
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
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

  const userId = userData.user.id;
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile || profile.role !== "admin") return false;

  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const isAuthorized = await isAuthorizedRequest(req, supabaseAdmin);
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

    const sheets = getSheetsClient();

    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
      fields: "sheets.properties.title",
    });
    const firstSheetName = (meta.data as any)?.sheets?.[0]?.properties?.title || "Sheet1";

    const valueRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: firstSheetName,
    });

    const values = valueRes.data.values;
    if (!values || values.length < 2) {
      return jsonResponse({ created: 0, updated: 0, skipped: 0, totalRows: 0 });
    }

    const rawHeaders = values[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
    const rows = values.slice(1);

    const headerIndexMap: Record<string, number> = {};
    rawHeaders.forEach((h, i) => {
      if (FIELD_MAP[h]) headerIndexMap[FIELD_MAP[h]] = i;
    });

    const incoming = rows.map((row) => {
      const record: Record<string, string> = {};
      for (const [field, idx] of Object.entries(headerIndexMap)) {
        record[field] = (row[idx] || "").trim();
      }
      return record;
    });

    const validIncoming = incoming.filter((r) => r.customer_name && r.phone_number);
    const skippedEmpty = incoming.length - validIncoming.length;

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("ai_generated_leads")
      .select("*")
      .range(0, 9999);
    if (existingError) {
      return jsonResponse({ error: existingError.message }, { status: 500 });
    }

    const existingByPhone: Record<string, any> = {};
    (existing ?? []).forEach((r: any) => {
      if (r?.phone_number) existingByPhone[r.phone_number] = r;
    });

    let created = 0;
    let updated = 0;
    let skipped = 0;

    const upsertPayload: any[] = [];

    for (const record of validIncoming) {
      const existingRecord = existingByPhone[record.phone_number];
      if (existingRecord) {
        const changed = Object.keys(record).some(
          (k) => (existingRecord[k] || "").toString().trim() !== (record[k] || "").toString().trim(),
        );
        if (changed) {
          upsertPayload.push({ id: existingRecord.id, ...record });
          updated++;
        } else {
          skipped++;
        }
      } else {
        upsertPayload.push({ ...record, status: "New", is_assigned: false });
        created++;
      }
    }

    if (upsertPayload.length) {
      const BATCH = 100;
      for (let i = 0; i < upsertPayload.length; i += BATCH) {
        const batch = upsertPayload.slice(i, i + BATCH);
        const { error } = await supabaseAdmin
          .from("ai_generated_leads")
          .upsert(batch, { onConflict: "phone_number" });
        if (error) {
          return jsonResponse({ error: error.message }, { status: 500 });
        }
      }
    }

    return jsonResponse({ created, updated, skipped, skippedEmpty, totalRows: rows.length, headers: rawHeaders });
  } catch (err: any) {
    return jsonResponse({ error: err?.message ?? String(err) }, { status: 500 });
  }
});
