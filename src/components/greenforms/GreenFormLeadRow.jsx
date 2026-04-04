import { useState } from "react";
import { supabaseApi } from "@/api/supabaseService";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCurrentUser } from "@/lib/CurrentUserContext";
import { MessageSquare, Pencil, Check, X, User, Phone, PhoneCall } from "lucide-react";
import { buildCallUrl, buildWhatsAppUrl } from "@/utils/phone";
import { toast } from "sonner";

// Legacy component retained only for historical reference.
// Not part of the active web runtime Green Forms path.
let hasWarnedLegacyGreenFormLeadRow = false;

const CLOSURE_REASONS = [
  { value: "not_interested", label: "Not Interested" },
  { value: "bought_elsewhere", label: "Bought Elsewhere" },
  { value: "price_issue", label: "Price Issue" },
  { value: "unreachable", label: "Unreachable" },
  { value: "duplicate", label: "Duplicate" },
  { value: "other", label: "Other" },
];

const ALLOWED_SOURCE_TYPES = new Set(["walkin", "ivr", "ai"]);

const resolveSourceType = (lead) => {
  const fromLead = String(lead?.source_type || lead?.source_pv || lead?.lead_source || "").trim().toLowerCase();
  if (ALLOWED_SOURCE_TYPES.has(fromLead)) return fromLead;

  const idValue = String(lead?.id || "");
  const separatorIndex = idValue.indexOf(":");
  if (separatorIndex > 0) {
    const prefix = idValue.slice(0, separatorIndex).trim().toLowerCase();
    if (ALLOWED_SOURCE_TYPES.has(prefix)) return prefix;
  }

  return "ai";
};

const resolveSourceRecordId = (lead) => {
  const explicit = lead?.source_record_id;
  if (explicit !== null && explicit !== undefined && String(explicit).trim() !== "") {
    return String(explicit);
  }

  const idValue = String(lead?.id || "");
  const separatorIndex = idValue.indexOf(":");
  if (separatorIndex > 0 && separatorIndex < idValue.length - 1) {
    return idValue.slice(separatorIndex + 1);
  }

  return idValue;
};

export default function GreenFormLeadRow({ lead, onUpdate }) {
  const queryClient = useQueryClient();
  const { currentUser } = useCurrentUser();

  if (!hasWarnedLegacyGreenFormLeadRow && typeof window !== "undefined") {
    hasWarnedLegacyGreenFormLeadRow = true;
    console.warn("[Legacy] GreenFormLeadRow is deprecated and not part of active runtime.");
  }

  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(lead.notes || "");
  const [isCloseSheetOpen, setIsCloseSheetOpen] = useState(false);
  const [closureReason, setClosureReason] = useState("not_interested");
  const [closureRemarks, setClosureRemarks] = useState("");
  const whatsappUrl = buildWhatsAppUrl(lead.phone_number, "");
  const callUrl = buildCallUrl(lead.phone_number);

  const closeRequestMutation = useMutation({
    mutationFn: () => supabaseApi.entities.GreenFormClosureRequest.create({
      source_type: resolveSourceType(lead),
      source_record_id: resolveSourceRecordId(lead),
      reason: closureReason,
      remarks: closureRemarks.trim() || null,
      requested_by_employee_id: currentUser?.employeeId ?? null,
    }),
    onSuccess: () => {
      toast.success("Closure request submitted");
      setIsCloseSheetOpen(false);
      setClosureRemarks("");
      setClosureReason("not_interested");
      queryClient.invalidateQueries({ queryKey: ["green-leads"] });
    },
    onError: (error) => {
      toast.error(error?.message || "Failed to submit closure request");
    },
  });

  const saveNotes = async () => {
    await supabaseApi.entities.GreenFormLead.update(lead.id, { notes });
    setEditingNotes(false);
    onUpdate();
  };

  const openWhatsApp = () => {
    if (!whatsappUrl) return;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  const openCall = () => {
    if (!callUrl) return;
    void supabaseApi.walkinFollowup.logCall({
      walkin_id: null,
      lead_source: resolveSourceType(lead),
      source_record_id: resolveSourceRecordId(lead),
      caller_id: currentUser?.authUserId ?? null,
      verdict: "call_later",
      notes: "Call button clicked",
    }).catch((error) => {
      console.error("Failed to log Green Form call click:", error);
      toast.error(error?.message || "Failed to log call click");
    });
    window.location.href = callUrl;
  };

  const handleConfirmClose = () => {
    if (closeRequestMutation.isPending) return;
    closeRequestMutation.mutate();
  };

  const fields = [
    ["PPL", lead.ppl],
    ["Source", lead.source_pv],
    ["Salesperson", lead.employee_full_name],
    ["Branch", lead.branch],
    ["TL Name", lead.tl_name],
    ["Sales Stage", lead.sales_stage],
    ["Opportunity", lead.opportunity_name],
  ].filter(([, v]) => v);

  const waDates = [lead.wa_1, lead.wa_2, lead.wa_3, lead.wa_4].filter(Boolean);

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
                <span className="text-gray-400 w-24 flex-shrink-0">{label}:</span>
                <span className="text-gray-700 font-medium truncate">{val}</span>
              </div>
            ))}
            {waDates.length > 0 && (
              <div className="flex items-start gap-1.5 text-xs">
                <span className="text-gray-400 w-24 flex-shrink-0">WA Dates:</span>
                <span className="text-gray-700 font-medium">{waDates.join(", ")}</span>
              </div>
            )}
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

        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            onClick={openCall}
            className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl h-10 w-10 p-0 shadow"
            aria-label="Call"
            title="Call"
            disabled={!callUrl}
          >
            <PhoneCall className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            onClick={openWhatsApp}
            className="bg-green-500 hover:bg-green-600 text-white rounded-xl h-10 w-10 p-0 shadow"
            aria-label="WhatsApp"
            title="WhatsApp"
            disabled={!whatsappUrl}
          >
            <MessageSquare className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsCloseSheetOpen(true)}
            className="rounded-xl h-10 px-3"
            title="Close"
          >
            Close
          </Button>
        </div>
      </div>

      <Sheet open={isCloseSheetOpen} onOpenChange={setIsCloseSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Close Green Form</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-3">
            <div className="space-y-1">
              <label htmlFor={`closure-reason-${lead.id}`} className="text-xs font-medium text-gray-600">
                Reason
              </label>
              <select
                id={`closure-reason-${lead.id}`}
                value={closureReason}
                onChange={(event) => setClosureReason(event.target.value)}
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                {CLOSURE_REASONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor={`closure-remarks-${lead.id}`} className="text-xs font-medium text-gray-600">
                Remarks (optional)
              </label>
              <textarea
                id={`closure-remarks-${lead.id}`}
                rows={3}
                value={closureRemarks}
                onChange={(event) => setClosureRemarks(event.target.value)}
                placeholder="Add remarks..."
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
              />
            </div>

            <Button
              className="w-full"
              onClick={handleConfirmClose}
              disabled={closeRequestMutation.isPending}
            >
              {closeRequestMutation.isPending ? "Submitting..." : "Confirm Close"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}