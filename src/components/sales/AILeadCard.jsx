import React, { useEffect, useMemo, useState } from 'react';
import { supabaseApi } from '@/api/supabaseService';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { User, Phone, Car, MessageSquare, CheckCircle, ChevronDown, ChevronUp, PhoneCall } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getNextFollowupStep } from '@/utils/sentMessageUtils';
import { buildCallUrl, buildWhatsAppUrl } from '@/utils/phone';

const STATUS_COLORS = {
  new: 'bg-blue-100 text-blue-700',
  contacted: 'bg-yellow-100 text-yellow-700',
  interested: 'bg-green-100 text-green-700',
  uninterested: 'bg-red-100 text-red-700',
  pending: 'bg-orange-100 text-orange-700',
  submitted: 'bg-indigo-100 text-indigo-700',
  closed: 'bg-gray-100 text-gray-500',
};

const STEP_KEYS = ['M1', 'M2', 'M3', 'M4'];

const normalizeTemplateToken = (value) => String(value ?? '').trim().toLowerCase();
const normalizeStepToken = (value) => String(value ?? '').trim().toUpperCase();

const normalizeStatus = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  const allowed = ['new', 'contacted', 'interested', 'uninterested', 'pending', 'submitted', 'closed'];
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
  sentMessages = [],
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
  const isIVRLead = String(lead?.lead_source ?? '').trim().toUpperCase() === 'IVR';
  const resolvedModelName = lead?.model_name ?? null;
  const resolvedDetails = lead?.remarks ?? null;
  const resolvedConversationSummary = lead?.conversation_summary ?? null;
  const resolvedConversationTranscript = lead?.conversation_transcript ?? null;

  const resolvedMode = mode || (isAssigned ? 'assigned' : 'unassigned');
  const isAssignedMode = resolvedMode === 'assigned';
  const whatsappUrl = buildWhatsAppUrl(resolvedPhoneNumber, '');
  const callUrl = buildCallUrl(resolvedPhoneNumber);

  const normalizedStatus = normalizeStatus(lead?.opty_status);
  const rawStatus = String(lead?.opty_status ?? '').trim().toLowerCase();
  const isLeadClosedOrUninterested = rawStatus === 'closed' || rawStatus === 'uninterested' || normalizedStatus === 'closed' || normalizedStatus === 'uninterested';
  const hasRequestedGreenForm = Boolean(lead?.greenform_requested);
  const hasOptyId = Boolean(String(lead?.opty_id ?? '').trim());
  const laterStageStatuses = new Set(['submitted', 'closed']);
  const hasLaterStageProgress = hasOptyId && laterStageStatuses.has(normalizedStatus);
  const assigneeDisplayName = lead?.employee_full_name || lead?.ca_name || (salespersonId ? String(salespersonId) : 'Unassigned');

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

  const followup = useMemo(() => {
    return getNextFollowupStep(lead, sentMessages);
  }, [lead, sentMessages]);

  const nextFollowupLabel = useMemo(() => {
    if (!isAssignedMode || followup.isCompleted || !followup.nextStep || !followup.dueDate) return null;
    const dueDate = followup.dueDate;
    if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) return null;
    return `${followup.nextStep} due ${dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }, [followup, isAssignedMode]);

  const takeMutation = useMutation({
    mutationFn: () => supabaseApi.entities.AILead.update(lead.id, {
      salesperson_id: currentEmployeeId,
      assigned_at: new Date().toISOString(),
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
      lead_disposition: 'uninterested',
      opty_status: 'closed',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-leads'] });
      setShowUpdate(false);
    },
  });

  const resolveTemplateForStep = (stepKey) => {
    const normalizedStep = normalizeStepToken(stepKey);
    const normalizedSource = normalizeTemplateToken(lead?.source ?? lead?.source_type ?? 'ai');
    const normalizedLeadModel = normalizeTemplateToken(lead?.model_name ?? lead?.car_model ?? lead?.ppl ?? '');
    const safeTemplates = Array.isArray(templates)
      ? templates.filter((template) => template?.is_active !== false)
      : [];

    // Priority 1: exact source + model_name + step.
    const exactMatch = safeTemplates.find((template) => {
      const templateSource = normalizeTemplateToken(template?.source ?? template?.category);
      const templateStep = normalizeStepToken(template?.step);
      const templateModel = normalizeTemplateToken(template?.model_name);
      return (
        templateSource === normalizedSource &&
        templateStep === normalizedStep &&
        templateModel &&
        normalizedLeadModel &&
        templateModel === normalizedLeadModel
      );
    });
    if (exactMatch) return exactMatch;

    // Priority 2: source + NULL model_name + step.
    const fallbackMatch = safeTemplates.find((template) => {
      const templateSource = normalizeTemplateToken(template?.source ?? template?.category);
      const templateStep = normalizeStepToken(template?.step);
      const rawModel = template?.model_name;
      const isNullModel = rawModel === null || rawModel === undefined || String(rawModel).trim() === '';
      return templateSource === normalizedSource && templateStep === normalizedStep && isNullModel;
    });
    if (fallbackMatch) return fallbackMatch;

    // Legacy compatibility for older template rows during transition.
    const legacyScoped = safeTemplates.filter((template) => {
      const category = normalizeTemplateToken(template?.category);
      return category === normalizedSource || category === 'all' || category === 'general';
    });
    return legacyScoped.find((template) => {
      const name = normalizeTemplateToken(template?.name);
      return name.includes(normalizeTemplateToken(stepKey));
    }) || null;
  };

  const openWhatsAppForStep = (stepKey) => {
    if (!resolvedPhoneNumber || !isAssignedMode) return;

    const template = resolveTemplateForStep(stepKey);
    const messageText = template?.template_text || buildDefaultStepMessage(lead, stepKey);
    const waLink = buildWhatsAppUrl(resolvedPhoneNumber, messageText);
    if (!waLink) return;

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

  const openCall = () => {
    if (!callUrl) return;
    window.location.href = callUrl;
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
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`text-[10px] px-2 py-1 rounded-full font-semibold ${STATUS_COLORS[normalizedStatus] || STATUS_COLORS.new}`}>
              {normalizedStatus === 'closed' ? 'Closed' : isAssignedMode ? 'Assigned' : 'Unassigned'}
            </span>
            {isIVRLead && (
              <span className="text-[10px] px-2 py-1 rounded-full font-semibold bg-sky-100 text-sky-700">
                IVR
              </span>
            )}
          </div>
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
            <span>Assigned to {isAdmin ? assigneeDisplayName : 'you'}</span>
          </div>
        )}

        {nextFollowupLabel && (
          <div className="mt-2 text-[11px] text-gray-500">
            <div className="font-medium text-gray-600">Next Follow-up</div>
            <div>{nextFollowupLabel}</div>
          </div>
        )}

        <div className="mt-3 space-y-2">
          {isAssignedMode && !isLeadClosedOrUninterested && (
            <div className="grid grid-cols-4 gap-1.5">
              {STEP_KEYS.map((stepKey, index) => {
                const stepAlreadySent = index < activeStepLimit;
                const stepEnabled = !stepAlreadySent && followup.nextStep === stepKey && followup.isDueNow;

                return (
                  <Button
                    key={stepKey}
                    size="sm"
                    variant={stepAlreadySent ? 'outline' : 'default'}
                    className={`text-[11px] rounded-lg h-8 ${stepAlreadySent ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
                    onClick={() => openWhatsAppForStep(stepKey)}
                    disabled={!whatsappUrl || !stepEnabled}
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
              className="text-xs rounded-xl h-8 px-3"
              onClick={openCall}
              aria-label="Call"
              title="Call"
              disabled={!callUrl}
            >
              <PhoneCall className="w-3.5 h-3.5 mr-1" />
              Call
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs rounded-xl h-8"
              onClick={() => setIsChatDialogOpen(true)}
            >
              {isIVRLead ? 'View Details' : 'View Full Chat'}
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

            <div className="space-y-1">
              <div className="text-xs text-gray-400">Lead Source</div>
              <div className="text-sm text-gray-700">
                {isIVRLead ? 'IVR Call' : 'AI Chatbot'}
              </div>
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
                <div className="text-xs text-gray-400">
                  {isIVRLead ? 'Call Notes' : 'Current Remarks'}
                </div>
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