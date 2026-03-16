import React, { useEffect, useMemo, useState } from 'react';
import { supabaseApi } from '@/api/supabaseService';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { User, Phone, Car, MessageSquare, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const STATUS_COLORS = {
  new: 'bg-blue-100 text-blue-700',
  contacted: 'bg-yellow-100 text-yellow-700',
  interested: 'bg-green-100 text-green-700',
  pending: 'bg-orange-100 text-orange-700',
  submitted: 'bg-indigo-100 text-indigo-700',
  closed: 'bg-gray-100 text-gray-500',
};

const STEP_KEYS = ['M1', 'M2', 'M3', 'M4'];

const normalizeStatus = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  const allowed = ['new', 'contacted', 'interested', 'pending', 'submitted', 'closed'];
  return allowed.includes(normalized) ? normalized : 'new';
};

const buildDefaultStepMessage = (lead, stepKey) => {
  const customerName = lead?.customer_name || 'Customer';
  const modelName = lead?.model_name || 'your preferred car';
  return `Hello ${customerName},\n\n${stepKey} follow-up for ${modelName}. Please let us know if you would like to continue the discussion.\n\nThank you.`;
};

export default function AILeadCard({
  lead,
  currentUser,
  isAdmin,
  mode,
  templates = [],
  onMarkSent,
  sentCount = 0,
}) {
  const queryClient = useQueryClient();
  const [showUpdate, setShowUpdate] = useState(false);
  const [isChatDialogOpen, setIsChatDialogOpen] = useState(false);
  const [greenFormError, setGreenFormError] = useState('');

  const currentEmployeeId = currentUser?.employeeId ?? null;
  const salespersonId = lead?.salesperson_id ?? null;
  const isAssigned = !(salespersonId === null || salespersonId === undefined || salespersonId === '');
  const resolvedPhoneNumber = lead?.mobile_number ?? null;
  const resolvedModelName = lead?.model_name ?? null;
  const resolvedDetails = lead?.remarks ?? null;
  const resolvedConversationSummary = lead?.conversation_summary ?? null;
  const resolvedConversationTranscript = lead?.conversation_transcript ?? null;

  const resolvedMode = mode || (isAssigned ? 'assigned' : 'unassigned');
  const isAssignedMode = resolvedMode === 'assigned';

  const normalizedStatus = normalizeStatus(lead?.opty_status);
  const hasRequestedGreenForm = Boolean(lead?.greenform_requested);
  const hasOptyId = Boolean(String(lead?.opty_id ?? '').trim());
  const laterStageStatuses = new Set(['submitted', 'closed']);
  const hasLaterStageProgress = hasOptyId && laterStageStatuses.has(normalizedStatus);

  useEffect(() => {
    setShowUpdate(false);
    setIsChatDialogOpen(false);
    setGreenFormError('');
  }, [lead?.id]);

  const isMyLead =
    salespersonId !== null &&
    salespersonId !== undefined &&
    currentEmployeeId !== null &&
    currentEmployeeId !== undefined &&
    String(salespersonId) === String(currentEmployeeId);

  const canOpenGreenForm =
    isAssignedMode &&
    (isMyLead || isAdmin) &&
    !hasRequestedGreenForm &&
    !hasLaterStageProgress;

  const activeStepLimit = useMemo(() => {
    const safeCount = Number.isFinite(sentCount) ? sentCount : 0;
    return Math.max(0, Math.min(STEP_KEYS.length, safeCount));
  }, [sentCount]);

  const takeMutation = useMutation({
    mutationFn: () => supabaseApi.entities.AILead.update(lead.id, {
      salesperson_id: currentEmployeeId,
      opty_status: 'contacted',
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-leads'] }),
  });

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

  const markUninterestedMutation = useMutation({
    mutationFn: () => supabaseApi.entities.AILead.update(lead.id, {
      opty_status: 'closed',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-leads'] });
      setShowUpdate(false);
    },
  });

  const resolveTemplateForStep = (stepKey) => {
    const scoped = templates.filter((template) => {
      const category = String(template?.category || '').trim().toLowerCase();
      const isActive = template?.is_active !== false;
      return isActive && (category === 'ai' || category === 'all' || category === 'general');
    });

    return scoped.find((template) => {
      const name = String(template?.name || '').trim().toLowerCase();
      return name.includes(stepKey.toLowerCase());
    }) || null;
  };

  const openWhatsAppForStep = (stepKey) => {
    if (!resolvedPhoneNumber || !isAssignedMode) return;

    const template = resolveTemplateForStep(stepKey);
    const messageText = template?.template_text || buildDefaultStepMessage(lead, stepKey);
    const waLink = `https://wa.me/${String(resolvedPhoneNumber || '').replace(/\D/g, '')}?text=${encodeURIComponent(messageText)}`;

    try {
      if (typeof onMarkSent === 'function') {
        onMarkSent({
          lead,
          leadType: 'ai_leads',
          messageText,
          templateId: template?.id ?? null,
        });
      }
    } catch (error) {
      console.error('Failed to log AI follow-up communication:', error);
    } finally {
      window.open(waLink, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-3">
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="font-semibold text-sm text-gray-900 truncate">{lead.customer_name}</span>
            </div>
            {resolvedPhoneNumber && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Phone className="w-3 h-3" />
                {resolvedPhoneNumber}
              </div>
            )}
          </div>
          <span className={`text-[10px] px-2 py-1 rounded-full font-semibold flex-shrink-0 ${STATUS_COLORS[normalizedStatus] || STATUS_COLORS.new}`}>
            {normalizedStatus === 'closed' ? 'Closed' : isAssignedMode ? 'Assigned' : 'Unassigned'}
          </span>
        </div>

        {resolvedModelName && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-600">
            <Car className="w-3.5 h-3.5 text-purple-400" />
            <span>{resolvedModelName}</span>
          </div>
        )}

        {resolvedDetails && (
          <div className="mt-2">
            <div className="flex items-center gap-1 text-[10px] text-gray-400 mb-0.5">
              <MessageSquare className="w-3 h-3" />
              Chat Preview
            </div>
            <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-2 py-1.5 whitespace-pre-wrap line-clamp-4">
              {resolvedDetails}
            </p>
          </div>
        )}

        {isAssigned && (
          <div className="mt-2 flex items-center gap-1 text-[10px] text-gray-500">
            <CheckCircle className="w-3 h-3 text-green-500" />
            <span>Assigned to {isAdmin ? salespersonId || 'Unassigned' : 'you'}</span>
          </div>
        )}

        <div className="mt-3 space-y-2">
          {isAssignedMode && (
            <div className="grid grid-cols-4 gap-1.5">
              {STEP_KEYS.map((stepKey, index) => {
                const stepAlreadySent = index < activeStepLimit;
                const stepEnabled = index === activeStepLimit;

                return (
                  <Button
                    key={stepKey}
                    size="sm"
                    variant={stepAlreadySent ? 'outline' : 'default'}
                    className={`text-[11px] rounded-lg h-8 ${stepAlreadySent ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
                    onClick={() => openWhatsAppForStep(stepKey)}
                    disabled={!resolvedPhoneNumber || !stepEnabled}
                  >
                    {stepKey}
                  </Button>
                );
              })}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs rounded-xl h-8"
              onClick={() => setIsChatDialogOpen(true)}
            >
              View Full Chat
            </Button>

            {resolvedMode === 'unassigned' && (
              <Button
                size="sm"
                className="flex-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-8"
                onClick={() => takeMutation.mutate()}
                disabled={takeMutation.isPending || !currentEmployeeId}
              >
                {takeMutation.isPending ? 'Picking...' : 'Pick Lead'}
              </Button>
            )}

            {isAssignedMode && (isMyLead || isAdmin) && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs rounded-xl h-8"
                onClick={() => setShowUpdate((prev) => !prev)}
              >
                {showUpdate ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
                {showUpdate ? 'Hide Update' : 'Update'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {showUpdate && isAssignedMode && (isMyLead || isAdmin) && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-2">
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

          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs rounded-xl h-8 border-red-200 text-red-600 hover:bg-red-50"
            onClick={() => markUninterestedMutation.mutate()}
            disabled={markUninterestedMutation.isPending}
          >
            {markUninterestedMutation.isPending ? 'Updating...' : 'Mark as Uninterested'}
          </Button>

          {greenFormError && (
            <p className="text-[11px] text-red-600">{greenFormError}</p>
          )}
        </div>
      )}

      <Dialog open={isChatDialogOpen} onOpenChange={setIsChatDialogOpen}>
        <DialogContent className="max-w-xl p-0 overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b border-gray-100">
            <DialogTitle className="text-base">AI Conversation</DialogTitle>
          </DialogHeader>

          <div className="px-4 py-3 space-y-3 max-h-[70vh] overflow-y-auto">
            <div className="space-y-1">
              <div className="text-xs text-gray-400">Customer</div>
              <div className="text-sm font-semibold text-gray-900">{lead?.customer_name || 'Unknown Customer'}</div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-gray-400">Model</div>
              <div className="text-sm text-gray-700">{resolvedModelName || 'Not available'}</div>
            </div>

            {resolvedConversationSummary && (
              <div className="space-y-1">
                <div className="text-xs text-gray-400">Conversation Summary</div>
                <div className="text-sm text-gray-700 bg-gray-50 rounded-lg border border-gray-100 px-3 py-2 whitespace-pre-wrap">
                  {resolvedConversationSummary}
                </div>
              </div>
            )}

            {resolvedDetails && (
              <div className="space-y-1">
                <div className="text-xs text-gray-400">Current Remarks</div>
                <div className="text-sm text-gray-700 bg-gray-50 rounded-lg border border-gray-100 px-3 py-2 whitespace-pre-wrap">
                  {resolvedDetails}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <div className="text-xs text-gray-400">Full Conversation Transcript</div>
              {resolvedConversationTranscript ? (
                <div className="text-sm text-gray-700 bg-gray-50 rounded-lg border border-gray-100 px-3 py-2 whitespace-pre-wrap">
                  {resolvedConversationTranscript}
                </div>
              ) : (
                <div className="text-sm text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-200 px-3 py-2">
                  Full transcript is not available for this lead yet.
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}