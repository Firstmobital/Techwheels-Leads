import { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { X, Upload, CheckCircle, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";

const ENTITY_TABLES = {
  VanaLead: "vana_leads",
  MatchTalkLead: "matchtalk_leads",
  GreenFormLead: "greenform_leads",
};

const TABLE_COLUMNS = {
  vana_leads: [
    "booking_id",
    "chassis_no",
    "ppl",
    "pl",
    "colour",
    "ca_name",
    "opty_id",
    "customer_name",
    "vc_number",
    "yf_open_date",
    "phone_number",
    "branch",
    "tl_name",
    "allocation_status",
  ],
  matchtalk_leads: [
    "chassis_no",
    "ppl",
    "pl",
    "colour",
    "ca_name",
    "customer_name",
    "phone_number",
    "no_status",
    "vc_number",
    "opty_id",
    "finance_remark",
    "wa_1",
    "wa_2",
    "next_message_date",
    "wa_v1",
    "wa_v2",
    "remarks",
  ],
  greenform_leads: [
    "ppl",
    "source_pv",
    "phone_number",
    "employee_full_name",
    "sales_stage",
    "customer_name",
    "opportunity_name",
    "tl_name",
    "branch",
    "total_offers",
    "ev_or_pv",
    "month",
    "wa_1",
    "wa_2",
    "wa_3",
    "wa_4",
    "next_message_date",
    "wa_v1",
    "wa_v2",
    "wa_v3",
    "wa_v4",
    "remarks",
    "mtd",
  ],
};

const normalizeHeaderToColumn = (header) => {
  if (header == null) return null;
  const raw = String(header).trim();
  if (!raw) return null;

  // Handle some common header variants.
  const lowered = raw.toLowerCase();
  const directAliases = {
    "chassis no": "chassis_no",
    "chassis": "chassis_no",
    "booking id": "booking_id",
    "opty id": "opty_id",
    "opportunity id": "opty_id",
    "customer name": "customer_name",
    "phone": "phone_number",
    "phone number": "phone_number",
    "ca name": "ca_name",
    "tl name": "tl_name",
    "vc number": "vc_number",
    "allocation status": "allocation_status",
    "opportunity name": "opportunity_name",
    "employee full name": "employee_full_name",
    "sales stage": "sales_stage",
    "finance remark": "finance_remark",
    "next message date": "next_message_date",
    "total offers": "total_offers",
    "ev/pv": "ev_or_pv",
  };
  if (directAliases[lowered]) return directAliases[lowered];

  return lowered
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
};

const readFileAsArrayBuffer = (f) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(reader.result);
    reader.readAsArrayBuffer(f);
  });

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
};

export default function ImportLeadsDialog({ entityName, onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const table = ENTITY_TABLES[entityName];
      const allowedColumns = TABLE_COLUMNS[table];
      if (!table || !allowedColumns) {
        setResult({ error: "Unsupported entity for import." });
        setLoading(false);
        return;
      }

      const buffer = await readFileAsArrayBuffer(file);
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames?.[0];
      const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;

      if (!sheet) {
        setResult({ error: "Could not read spreadsheet. Check format." });
        setLoading(false);
        return;
      }

      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });
      if (!rawRows || rawRows.length === 0) {
        setResult({ error: "No rows found in file." });
        setLoading(false);
        return;
      }

      const records = rawRows
        .map((row) => {
          const record = {};
          for (const [header, value] of Object.entries(row)) {
            const col = normalizeHeaderToColumn(header);
            if (!col) continue;
            if (!allowedColumns.includes(col)) continue;
            // Convert empty strings to null so Supabase inserts are cleaner.
            const cleaned = typeof value === "string" && value.trim() === "" ? null : value;
            record[col] = cleaned;
          }
          return record;
        })
        .filter((r) => Object.keys(r).length > 0);

      if (records.length === 0) {
        setResult({ error: "Could not map any columns. Check header names." });
        setLoading(false);
        return;
      }

      // Insert in chunks to avoid request size limits.
      const batches = chunk(records, 500);
      for (const batch of batches) {
        const { error } = await supabase.from(table).insert(batch);
        if (error) throw error;
      }

      setResult({ success: true, count: records.length });
      onImported();
      setLoading(false);
    } catch (e) {
      const msg = e?.message || "Import failed.";
      setResult({ error: msg });
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Import Leads</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        {!result ? (
          <>
            <p className="text-sm text-gray-500 mb-4">Upload a CSV or Excel file to import leads.</p>
            <input
              id="file-upload"
              name="file"
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={e => setFile(e.target.files[0])}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100 mb-4"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button disabled={!file || loading} onClick={handleImport} className="bg-green-600 hover:bg-green-700">
                {loading ? "Importing..." : <><Upload className="w-4 h-4 mr-2" />Import</>}
              </Button>
            </div>
          </>
        ) : result.error ? (
          <div className="text-center py-4">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-2" />
            <p className="text-red-600 text-sm">{result.error}</p>
            <Button variant="outline" className="mt-4" onClick={() => setResult(null)}>Try Again</Button>
          </div>
        ) : (
          <div className="text-center py-4">
            <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
            <p className="text-green-700 font-medium">{result.count} leads imported!</p>
            <Button className="mt-4 bg-green-600 hover:bg-green-700" onClick={onClose}>Done</Button>
          </div>
        )}
      </div>
    </div>
  );
}