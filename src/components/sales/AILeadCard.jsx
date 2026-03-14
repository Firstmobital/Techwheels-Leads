import React, { useEffect, useState } from 'react';
import { supabaseApi } from '@/api/supabaseService';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { User, Phone, Car, MessageSquare, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STATUS_OPTIONS = ['new', 'contacted', 'interested', 'pending', 'submitted', 'closed'];
const STATUS_LABELS = {
  new: 'New',
  contacted: 'Contacted',
  interested: 'Interested',
  pending: 'Pending',
  submitted: 'Submitted',
  closed: 'Closed',
};
const STATUS_COLORS = {
  new: 'bg-blue-100 text-blue-700',
  contacted: 'bg-yellow-100 text-yellow-700',
  interested: 'bg-green-100 text-green-700',
  pending: 'bg-orange-100 text-orange-700',
  submitted: 'bg-indigo-100 text-indigo-700',
  closed: 'bg-gray-100 text-gray-500',
};

const normalizeStatus = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return STATUS_OPTIONS.includes(normalized) ? normalized : 'new';
};

export default function AILeadCard({ lead, currentUser, isAdmin }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [remarks, setRemarks] = useState(lead?.remarks ?? '');
  const [status, setStatus] = useState(normalizeStatus(lead?.opty_status));
  const [saving, setSaving] = useState(false);
  const [greenFormError, setGreenFormError] = useState('');

  const currentEmployeeId = currentUser?.employeeId ?? null;
  const salespersonId = lead?.salesperson_id ?? null;
  const isAssigned = Boolean(salespersonId);
  const resolvedPhoneNumber = lead?.mobile_number ?? null;
  const resolvedModelName = lead?.model_name ?? null;
  const resolvedDetails = lead?.remarks ?? null;

  const normalizedStatus = normalizeStatus(lead?.opty_status);
  const hasRequestedGreenForm = Boolean(lead?.greenform_requested);
  const hasOptyId = Boolean(String(lead?.opty_id ?? '').trim());
  const laterStageStatuses = new Set(['submitted', 'closed']);
  const hasLaterStageProgress = hasOptyId && laterStageStatuses.has(normalizedStatus);

  useEffect(() => {
    setRemarks(lead?.remarks ?? '');
    setStatus(normalizeStatus(lead?.opty_status));
  }, [lead?.id, lead?.remarks, lead?.opty_status]);

  const isMyLead =
    salespersonId !== null &&
    salespersonId !== undefined &&
    currentEmployeeId !== null &&
    currentEmployeeId !== undefined &&
    String(salespersonId) === String(currentEmployeeId);

  const canOpenGreenForm =
    (isMyLead || isAdmin) &&
    !hasRequestedGreenForm &&
    !hasLaterStageProgress;

  const takeMutation = useMutation({
    mutationFn: () => supabaseApi.entities.AILead.update(lead.id, {
      salesperson_id: currentEmployeeId,
      opty_status: 'contacted',
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-leads'] }),
  });

  const saveUpdate = async () => {
    setSaving(true);
    await supabaseApi.entities.AILead.update(lead.id, {
      opty_status: normalizeStatus(status),
      remarks,
    });
    queryClient.invalidateQueries({ queryKey: ['ai-leads'] });
    setSaving(false);
  };

  const openGreenFormMutation = useMutation({
    mutationFn: () => supabaseApi.entities.AILead.requestGreenForm(lead.id),
    onSuccess: () => {
      setGreenFormError('');
      queryClient.invalidateQueries({ queryKey: ['ai-leads'] });
    },
    onError: (error) => {
      setGreenFormError(error?.message || 'Failed to open green form');
    },
  });

  const handleOpenGreenForm = () => {
    if (!canOpenGreenForm || openGreenFormMutation.isPending) return;
    setGreenFormError('');
    openGreenFormMutation.mutate();
  };

  const logAIMessageMutation = useMutation({
    mutationFn: (payload) => supabaseApi.entities.SentMessage.create(payload),
  });

  const handleWhatsAppClick = async (event) => {
    if (!resolvedPhoneNumber) return;
    event.preventDefault();

    const payload = {
      customer_name: lead?.customer_name ?? null,
      mobile_number: resolvedPhoneNumber,
      message_text: resolvedDetails ?? null,
      template_id: null,
      lead_source: 'ai',
      source_record_id: lead?.id ?? null,
      sent_by_employee_id: currentEmployeeId ?? null,
      sent_via: 'whatsapp_link',
      status: 'sent',
    };

    try {
      await logAIMessageMutation.mutateAsync(payload);
    } catch (error) {
      // Keep existing UX: open WhatsApp even if logging fails.
      console.error('Failed to log AI WhatsApp communication:', error);
    } finally {
      window.open(waLink, '_blank', 'noopener,noreferrer');
    }
  };

  const waLink = `https://wa.me/${String(resolvedPhoneNumber || '').replace(/\D/g, '')}`;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-3">
      <div className="px-4 py-3">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="font-semibold text-sm text-gray-900 truncate">{lead.customer_name}</span>
            </div>
            {resolvedPhoneNumber && (
              <a href={waLink} target="_blank" rel="noopener noreferrer"
                onClick={handleWhatsAppClick}
                className="flex items-center gap-1.5 text-xs text-emerald-600 hover:underline">
                <Phone className="w-3 h-3" />
                {resolvedPhoneNumber}
              </a>
            )}
          </div>
          <span className={`text-[10px] px-2 py-1 rounded-full font-semibold flex-shrink-0 ${STATUS_COLORS[status] || STATUS_COLORS.new}`}>
            {STATUS_LABELS[status] || STATUS_LABELS.new}
          </span>
        </div>

        {/* Car interest */}
        {resolvedModelName && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-600">
            <Car className="w-3.5 h-3.5 text-purple-400" />
            <span>{resolvedModelName}</span>
          </div>
        )}

        {/* Chat details */}
        {resolvedDetails && (
          <div className="mt-2">
            <div className="flex items-center gap-1 text-[10px] text-gray-400 mb-0.5">
              <MessageSquare className="w-3 h-3" />
              Chat Details
            </div>
            <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-2 py-1.5 whitespace-pre-wrap line-clamp-6">
              {resolvedDetails}
            </p>
          </div>
        )}

        {/* Assigned badge */}
        {isAssigned && (
          <div className="mt-2 flex items-center gap-1 text-[10px] text-gray-500">
            <CheckCircle className="w-3 h-3 text-green-500" />
            <span>Assigned to {isAdmin ? salespersonId || 'Unassigned' : 'you'}</span>
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex gap-2">
          {!isAssigned && (
            <Button
              size="sm"
              className="flex-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-8"
              onClick={() => takeMutation.mutate()}
              disabled={takeMutation.isPending || !currentEmployeeId}
            >
              {takeMutation.isPending ? 'Taking...' : '✋ Take Lead'}
            </Button>
          )}
          {(isMyLead || isAdmin) && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs rounded-xl h-8"
              onClick={() => setExpanded(e => !e)}
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
              {expanded ? 'Hide' : 'Update'}
            </Button>
          )}
        </div>
      </div>

      {/* Expanded section */}
      {expanded && (isMyLead || isAdmin) && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
          {/* Chat details */}
          {resolvedDetails && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                <MessageSquare className="w-3.5 h-3.5" />
                Chat Details
              </div>
              <p className="text-xs text-gray-500 bg-white rounded-lg p-2 border border-gray-100 whitespace-pre-wrap max-h-28 overflow-y-auto">
                {resolvedDetails}
              </p>
            </div>
          )}

          {/* Status */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Status</label>
            <div className="flex gap-1.5 flex-wrap">
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`text-[10px] px-2.5 py-1 rounded-full font-medium border transition-all ${
                    status === s ? `${STATUS_COLORS[s]} border-transparent` : 'bg-white text-gray-500 border-gray-200'
                  }`}
                >
                  {STATUS_LABELS[s] || s}
                </button>
              ))}
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Remarks</label>
            <textarea
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              rows={2}
              placeholder="Add remarks..."
              className="w-full text-xs rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-300 resize-none"
            />
          </div>

          <Button
            size="sm"
            className="w-full text-xs bg-gray-900 hover:bg-gray-800 text-white rounded-xl h-8"
            onClick={saveUpdate}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs rounded-xl h-8"
            onClick={handleOpenGreenForm}
            disabled={!canOpenGreenForm || openGreenFormMutation.isPending}
          >
            {openGreenFormMutation.isPending
              ? 'Opening...'
              : hasRequestedGreenForm
                ? 'Green Form Requested'
                : hasLaterStageProgress
                  ? 'Green Form Not Needed'
                  : 'Open Green Form'}
          </Button>

          {greenFormError && (
            <p className="text-[11px] text-red-600">{greenFormError}</p>
          )}
        </div>
      )}
    </div>
  );
}