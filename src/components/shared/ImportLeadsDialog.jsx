import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { X, Upload, CheckCircle, AlertCircle } from "lucide-react";

export default function ImportLeadsDialog({ entityName, onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const schema = await base44.entities[entityName].schema();
    const extracted = await base44.integrations.Core.ExtractDataFromUploadedFile({
      file_url,
      json_schema: {
        type: "object",
        properties: {
          records: {
            type: "array",
            items: { type: "object", properties: schema.properties }
          }
        }
      }
    });

    if (extracted.status !== "success" || !extracted.output?.records?.length) {
      setResult({ error: "Could not extract data from file. Check format." });
      setLoading(false);
      return;
    }

    const records = extracted.output.records;
    await base44.entities[entityName].bulkCreate(records);
    setResult({ success: true, count: records.length });
    onImported();
    setLoading(false);
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