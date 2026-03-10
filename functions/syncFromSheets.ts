import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Sheet ID for Vana, MatchTalk, GreenForm data
const SPREADSHEET_ID = "1MWP5PPNgZ2HmA0XnPfPM32Gu9USQofLhSTWl8JbwS_k";

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

async function fetchSheetData(accessToken, sheetName) {
  const encoded = encodeURIComponent(sheetName);

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encoded}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    throw new Error(await res.text());
  }

  const data = await res.json();
  return data.values || [];
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
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const entityName = body.entity;

    if (!SHEET_CONFIG[entityName]) {
      return Response.json(
        { error: "Invalid entity" },
        { status: 400 }
      );
    }

    const { accessToken } =
      await base44.asServiceRole.connectors.getConnection("googlesheets");

    const config = SHEET_CONFIG[entityName];

    const values = await fetchSheetData(accessToken, config.sheetName);

    console.log("Sheet rows:", values.length);
    console.log("Sheet headers:", values[0]);

    const rows = parseRows(values, entityName);

    console.log("Parsed rows:", rows.length);
    if (rows.length > 0) console.log("Sample row:", rows[0]);

    const existing =
      await base44.asServiceRole.entities[entityName].list(null, 10000);

    const existingMap = {};

    existing.forEach(r => {
      const key = r[config.uniqueKey];
      if (key) existingMap[key] = r;
    });

    const newRows = [];
    const updateRows = [];

    let skipped = 0;

    for (const row of rows) {
      const key = row[config.uniqueKey];

      if (!key) {
        skipped++;
        continue;
      }

      const existingRow = existingMap[key];

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

    for (let i = 0; i < newRows.length; i += BATCH) {
      const batch = newRows.slice(i, i + BATCH);

      try {
        await base44.asServiceRole.entities[entityName].bulkCreate(batch);
        created += batch.length;
      } catch (e) {
        console.log("Batch create failed, trying individual rows:", e.message);
        // Try creating rows individually to identify which ones fail
        for (const row of batch) {
          try {
            await base44.asServiceRole.entities[entityName].create(row);
            created++;
          } catch (rowErr) {
            console.log("Row skipped:", row, rowErr.message);
            skipped++;
          }
        }
      }
    }

    for (const row of updateRows) {
      try {
        await base44.asServiceRole.entities[entityName].update(row.id, row);
        updated++;
      } catch (e) {
        console.log("Update skipped:", row.id, e.message);
      }
      await new Promise(res => setTimeout(res, 800));
    }

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