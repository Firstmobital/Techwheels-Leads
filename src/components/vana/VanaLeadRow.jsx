import { useState } from "react";
import { supabaseApi } from "@/api/supabaseService";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Pencil, Check, X, User, Phone } from "lucide-react";

export default function VanaLeadRow({ lead, onUpdate }) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(lead.notes || "");

  const saveNotes = async () => {
    await supabaseApi.entities.VanaLead.update(lead.id, { notes });
    setEditingNotes(false);
    onUpdate();
  };

  const openWhatsApp = () => {
    const phone = lead.phone_number?.replace(/\D/g, "");
    window.open(`https://wa.me/${phone}`, "_blank");
  };

  const fields = [
    ["PPL", lead.ppl],
    ["PL", lead.pl],
    ["Chassis No", lead.chassis_no],
    ["Colour", lead.colour],
    ["CA Name", lead.ca_name],
    ["Branch", lead.branch],
    ["TL Name", lead.tl_name],
    ["Allocation Status", lead.allocation_status],
    ["VC #", lead.vc_number],
  ].filter(([, v]) => v);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <h3 className="font-semibold text-gray-900 text-sm truncate">{lead.customer_name}</h3>
          </div>
          <div className="flex items-center gap-1.5 mb-2">
            <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-xs text-gray-500 font-mono">{lead.phone_number}</span>
          </div>
          <div className="space-y-0.5">
            {fields.map(([label, val]) => (
              <div key={label} className="flex items-center gap-1.5 text-xs">
                <span className="text-gray-400 w-28 flex-shrink-0">{label}:</span>
                <span className="text-gray-700 font-medium truncate">{val}</span>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div className="mt-2">
            {editingNotes ? (
              <div className="flex flex-col gap-1">
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="text-xs min-h-[60px]" placeholder="Add notes..." />
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={saveNotes}><Check className="w-3 h-3 text-green-600" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setNotes(lead.notes || ""); setEditingNotes(false); }}><X className="w-3 h-3 text-red-500" /></Button>
                </div>
              </div>
            ) : (
              <button onClick={() => setEditingNotes(true)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
                <Pencil className="w-3 h-3" />
                <span className="truncate max-w-[180px]">{lead.notes || "Add notes..."}</span>
              </button>
            )}
          </div>
        </div>

        <Button
          size="sm"
          onClick={openWhatsApp}
          className="bg-green-500 hover:bg-green-600 text-white rounded-xl h-10 w-10 p-0 flex-shrink-0 shadow"
        >
          <MessageSquare className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}