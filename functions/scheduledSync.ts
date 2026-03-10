import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const SPREADSHEET_ID = "1MWP5PPNgZ2HmA0XnPfPM32Gu9USQofLhSTWl8JbwS_k";

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

async function fetchSheetData(accessToken, sheetName) {
  const encodedSheet = encodeURIComponent(sheetName);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodedSheet}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Failed to fetch sheet "${sheetName}": ${await res.text()}`);
  const data = await res.json();
  return data.values || [];
}

function parseRows(values, entityName) {
  if (!values || values.length < 2) return [];
  const headers = values[0];
  const fieldMap = FIELD_MAPS[entityName];
  return values.slice(1).map(row => {
    const record = {};
    headers.forEach((header, i) => {
      const fieldName = fieldMap[header];
      if (fieldName && row[i] !== undefined && row[i] !== "") record[fieldName] = row[i];
    });
    return record;
  }).filter(r => Object.keys(r).length > 0);
}

async function syncEntity(base44, accessToken, entityName) {
  const config = SHEET_CONFIG[entityName];
  const values = await fetchSheetData(accessToken, config.sheetName);
  const rows = parseRows(values, entityName);
  if (rows.length === 0) return { created: 0, updated: 0, skipped: 0 };

  const existing = await base44.asServiceRole.entities[entityName].list(null, 10000);
  const existingMap = {};
  existing.forEach(r => { if (r[config.uniqueKey]) existingMap[r[config.uniqueKey]] = r; });

  let skipped = 0;
  const newRows = [];
  const updateRows = [];

  rows.forEach(row => {
    const uniqueVal = row[config.uniqueKey];
    if (!uniqueVal || !row.customer_name || !row.phone_number) { skipped++; return; }
    if (existingMap[uniqueVal]) {
      updateRows.push({ id: existingMap[uniqueVal].id, data: row });
    } else {
      newRows.push(row);
    }
  });

  const BATCH = 10;
  let created = 0;
  for (let i = 0; i < newRows.length; i += BATCH) {
    const batch = newRows.slice(i, i + BATCH);
    try {
      await base44.asServiceRole.entities[entityName].bulkCreate(batch);
      created += batch.length;
    } catch (e) {
      console.log(`Bulk create failed, trying individually:`, e.message);
      for (const row of batch) {
        try {
          await base44.asServiceRole.entities[entityName].create(row);
          created++;
        } catch (re) { console.log('Row skipped:', re.message); }
        await new Promise(r => setTimeout(r, 500));
      }
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  let updated = 0;
  for (const row of updateRows) {
    try {
      await base44.asServiceRole.entities[entityName].update(row.id, row.data);
      updated++;
    } catch (e) { console.log('Update skipped:', e.message); }
    await new Promise(r => setTimeout(r, 1000));
  }

  return { created, updated, skipped };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { accessToken } = await base44.asServiceRole.connectors.getConnection("googlesheets");

    const results = {};
    for (const entityName of ['VanaLead', 'MatchTalkLead', 'GreenFormLead']) {
      results[entityName] = await syncEntity(base44, accessToken, entityName);
      console.log(`Synced ${entityName}:`, results[entityName]);
      await new Promise(r => setTimeout(r, 3000));
    }

    return Response.json({ message: "All synced successfully", results });
  } catch (error) {
    console.error("Scheduled sync error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});