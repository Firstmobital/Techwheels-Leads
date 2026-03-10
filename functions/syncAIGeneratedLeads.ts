import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const SPREADSHEET_ID = Deno.env.get('GOOGLE_SHEET_ID_AI_LEADS') || '1YbAJFJHshygUFs0nYfaYQu9ig4KDTSqnIuaf1tY6gdo';

const FIELD_MAP = {
  'customer_name': 'customer_name',
  'phone_number': 'phone_number',
  'car_of_interest': 'car_of_interest',
  'chat_details': 'chat_details',
};

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

  // First, get the spreadsheet metadata to find the first sheet name
  const metaResp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!metaResp.ok) {
    const err = await metaResp.text();
    return Response.json({ error: `Metadata API error: ${err}` }, { status: 500 });
  }
  const meta = await metaResp.json();
  const firstSheetName = meta.sheets?.[0]?.properties?.title || 'Sheet1';

  const encoded = encodeURIComponent(firstSheetName);
  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encoded}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!resp.ok) {
    const err = await resp.text();
    return Response.json({ error: `Sheets API error: ${err}` }, { status: 500 });
  }

  const { values } = await resp.json();
  if (!values || values.length < 2) {
    return Response.json({ created: 0, updated: 0, skipped: 0, totalRows: 0 });
  }

  // Normalize headers: lowercase + underscores
  const rawHeaders = values[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const rows = values.slice(1);

  // Map header positions
  const headerIndexMap = {};
  rawHeaders.forEach((h, i) => {
    if (FIELD_MAP[h]) headerIndexMap[FIELD_MAP[h]] = i;
  });

  // Parse rows
  const incoming = rows.map(row => {
    const record = {};
    for (const [field, idx] of Object.entries(headerIndexMap)) {
      record[field] = (row[idx] || '').trim();
    }
    return record;
  });

  const validIncoming = incoming.filter(r => r.customer_name && r.phone_number);
  const skippedEmpty = incoming.length - validIncoming.length;

  // Get existing records
  const existing = await base44.asServiceRole.entities.AIGeneratedLead.list(null, 10000);
  const existingByPhone = {};
  existing.forEach(r => { existingByPhone[r.phone_number] = r; });

  let created = 0, updated = 0, skipped = 0;

  for (const record of validIncoming) {
    const existing_record = existingByPhone[record.phone_number];
    if (existing_record) {
      const changed = Object.keys(record).some(k => (existing_record[k] || '') !== record[k]);
      if (changed) {
        await base44.asServiceRole.entities.AIGeneratedLead.update(existing_record.id, record);
        updated++;
      } else {
        skipped++;
      }
    } else {
      await base44.asServiceRole.entities.AIGeneratedLead.create({
        ...record,
        status: 'New',
        is_assigned: false,
      });
      created++;
    }
  }

  return Response.json({ created, updated, skipped, skippedEmpty, totalRows: rows.length, headers: rawHeaders });
});