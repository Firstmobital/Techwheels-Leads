import React, { useMemo, useState } from 'react';
import { MessageCircle, CheckCircle2, Car, Phone, User, Clock, PhoneCall } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { differenceInDays } from 'date-fns';
import { getNormalizedLead } from './leadDataHelper';
import { matchesSentMessageToLead } from '@/utils/sentMessageUtils';
import { buildCallUrl, buildWhatsAppUrl } from '@/utils/phone';

const UIButton = /** @type {any} */ (Button);
const UIDrawer = /** @type {any} */ (Drawer);
const UIDrawerTrigger = /** @type {any} */ (DrawerTrigger);
const UIDrawerContent = /** @type {any} */ (DrawerContent);

// Legacy day-based follow-up sequence (used when templates don't define delay/step).
const FOLLOW_UP_DAYS = [1, 2, 5];
const MATCHTALK_FOLLOW_UP_DAYS = [1, 2, 4];

const CATEGORY_ALIASES = {
  vana: ['vana', 'vna'],
  matchtalk: ['matchtalk', 'match_stock', 'match'],
  greenforms: ['greenforms', 'green_forms', 'greenform'],
  ai_leads: ['ai_leads', 'ai-leads', 'ai'],
};

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toCanonicalCategory = (value) => {
  const token = String(value || '').trim().toLowerCase();
  if (!token) return '';
  if (token === 'all' || token === 'general') return token;
  const entry = Object.entries(CATEGORY_ALIASES).find(([, aliases]) => aliases.includes(token));
  return entry ? entry[0] : token;
};

const getTemplateCategory = (template) => {
  const rawCategory = template?.category;
  const rawSource = template?.source;
  return toCanonicalCategory(rawCategory || rawSource || '');
};

const FOLLOW_UP_MESSAGES = {
  vana: {
    1: (lead) => `Hello ${lead.customer_name},\n\nWe currently do not have the ${lead.car_model || 'car'} available.\nWe will inform you as soon as it becomes available.\n\nThank you.`,
    2: (lead) => `Hello ${lead.customer_name},\n\nJust following up on your interest in the ${lead.car_model || 'car'}.\nWe're still working on getting it available for you.\n\nThank you for your patience.`,
    5: (lead) => `Hello ${lead.customer_name},\n\nWe wanted to check back regarding the ${lead.car_model || 'car'}.\nIs there anything else we can help you with in the meantime?\n\nThank you.`,
  },
  matchtalk: {
    1: (lead) => `Booking Name: ${lead.customer_name}\nCar Model: ${lead.ppl || ''}\nVariant: ${lead.pl || ''}\nSales Advisor: ${lead.ca_name || ''}\nContact No.: \n\nWe are pleased to inform you that your vehicle is now available for billing and the chassis number has been allotted.\n\nKindly proceed with the billing and RTO formalities at the earliest. As per company policy, we can hold the vehicle for 4 working days only.\n\nIf you are not planning to take delivery within the next 7 days, we kindly request you to inform us and allow us to allocate the vehicle to the next waiting customer.\n\nWe truly appreciate your understanding and look forward to assisting you with the delivery.\n\nThank you.`,
    2: (lead) => `Booking Name: ${lead.customer_name}\nCar Model: ${lead.ppl || ''}\nVariant: ${lead.pl || ''}\nSales Advisor: ${lead.ca_name || ''}\nContact No.: \n\nहमें आपको यह बताते हुए खुशी हो रही है कि आपकी गाड़ी अब बिलिंग के लिए उपलब्ध है और उसका चेसिस नंबर अलॉट हो चुका है।\n\nकृपया जल्द से जल्द बिलिंग और RTO की औपचारिकताएं पूरी करें। कंपनी की पॉलिसी के अनुसार हम वाहन को केवल 4 कार्य दिवसों तक ही होल्ड कर सकते हैं।\n\nयदि आप अगले 7 दिनों के भीतर डिलीवरी लेने की योजना नहीं बना रहे हैं, तो कृपया हमें सूचित करें ताकि हम इस वाहन को अगले वेटिंग ग्राहक को अलॉट कर सकें।\n\nआपके सहयोग के लिए हम आभारी हैं और आपकी गाड़ी की डिलीवरी में सहायता करने के लिए उत्सुक हैं।\n\nधन्यवाद।`,
    4: (lead) => `Booking Name: ${lead.customer_name}\nCar Model: ${lead.ppl || ''}\nVariant: ${lead.pl || ''}\nSales Advisor: ${lead.ca_name || ''}\nContact No.: \n\nThis is a reminder that your vehicle is still awaiting billing. We have already communicated the urgency earlier.\n\nKindly complete the billing and RTO formalities immediately to avoid reallocation.\n\nThank you.`,
  },
  greenforms: {
    1: (lead) => `Hello ${lead.customer_name},\n\nThank you for your interest in the ${lead.model_name || lead.car_model || lead.ppl || 'car'}.\n\nOur team would be happy to assist you with details or a test drive.\n\nPlease let us know how we can help.`,
    2: (lead) => `Hello ${lead.customer_name},\n\nFollowing up on your inquiry about the ${lead.model_name || lead.car_model || lead.ppl || 'car'}.\nWould you like to book a test drive or get a quote?\n\nThank you.`,
    5: (lead) => `Hello ${lead.customer_name},\n\nWe're reaching out once more regarding the ${lead.model_name || lead.car_model || lead.ppl || 'car'}.\nOur team is ready to assist you whenever you're ready.\n\nThank you.`,
  },
};

function getDaysSinceFirstSent(history) {
  if (!history?.length) return null;
  const first = [...history].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
  if (!first?.created_at) return null;
  return differenceInDays(new Date(), new Date(first.created_at));
}

function getNextDueStep(history, tab, sequenceTemplates = []) {
  const sentCount = history?.length || 0;

  if (sequenceTemplates.length > 0) {
    if (sentCount >= sequenceTemplates.length) return null;

    const nextTemplate = sequenceTemplates[sentCount];
    const nextStep = Math.max(1, toInt(nextTemplate?.step_number, sentCount + 1));
    const nextDelay = Math.max(0, toInt(nextTemplate?.delay_days, 0));

    const daysSince = getDaysSinceFirstSent(history);
    if (daysSince === null) {
      return { step: nextStep, daysUntil: nextDelay, overdue: false };
    }

    if (daysSince >= nextDelay) {
      return { step: nextStep, daysUntil: 0, overdue: daysSince > nextDelay };
    }

    return { step: nextStep, daysUntil: nextDelay - daysSince, overdue: false };
  }

  const days = tab === 'matchtalk' ? MATCHTALK_FOLLOW_UP_DAYS : FOLLOW_UP_DAYS;

  if (sentCount >= days.length) return null;

  const nextStep = days[sentCount];
  if (nextStep === 1) {
    return { step: 1, daysUntil: 0, overdue: false };
  }

  const daysSince = getDaysSinceFirstSent(history);
  if (daysSince === null) {
    return { step: nextStep, daysUntil: nextStep, overdue: false };
  }

  if (daysSince >= nextStep) {
    return { step: nextStep, daysUntil: 0, overdue: true };
  }

  return { step: nextStep, daysUntil: nextStep - daysSince, overdue: false };
}

export default function LeadCard({ lead, tab, accentColor, message, isSent, onMarkSent, templates, sentMessages = [] }) {
   const [selectedTemplateId, setSelectedTemplateId] = useState('default');
   const normalizedLead = getNormalizedLead(lead);
  const isGreenForms = tab === 'greenforms';
  const resolvedPhone = isGreenForms
    ? (normalizedLead.mobile_number || normalizedLead.phone_number || '')
    : (normalizedLead.phone_number || normalizedLead.mobile_number || '');
  const resolvedCarModel = isGreenForms
    ? (normalizedLead.model_name || normalizedLead.car_model || normalizedLead.ppl)
    : (normalizedLead.car_model || normalizedLead.model_name || normalizedLead.ppl);
  const resolvedGreenFormSource = normalizedLead.source_type || normalizedLead.source_pv || '';
  const resolvedGreenFormOwnerId = normalizedLead.salesperson_id || normalizedLead.assigned_to || '';
  const resolvedGreenFormOwnerName = normalizedLead.employee_full_name || normalizedLead.ca_name || '';

  const relevantTemplates = useMemo(() => {
    const safeTemplates = Array.isArray(templates) ? templates : [];
    return safeTemplates.filter((template) => {
      if (template?.is_active === false) return false;
      const category = getTemplateCategory(template);
      return category === tab || category === 'all' || category === 'general';
    });
  }, [templates, tab]);

  const sequenceTemplates = useMemo(() => {
    const normalized = relevantTemplates
      .filter((template) => template?.step_number !== null && template?.step_number !== undefined)
      .map((template, index) => ({
        ...template,
        step_number: Math.max(1, toInt(template?.step_number, index + 1)),
        delay_days: Math.max(0, toInt(template?.delay_days, 0)),
      }))
      .sort((a, b) => {
        if (a.step_number !== b.step_number) return a.step_number - b.step_number;
        return a.delay_days - b.delay_days;
      });

      const hasConfiguredTiming = normalized.some((template) => template.step_number > 1 || template.delay_days > 0);
      return hasConfiguredTiming ? normalized : [];
  }, [relevantTemplates]);

  const historyForLead = sentMessages.filter((row) => matchesSentMessageToLead(row, lead, tab));
   const nextDue = getNextDueStep(historyForLead, tab, sequenceTemplates);
   const allDone = !nextDue;

   // For current step, pick the right message
   const stepMessages = FOLLOW_UP_MESSAGES[tab] || FOLLOW_UP_MESSAGES.greenforms;
   const currentStep = nextDue?.step || 1;
   const defaultMessage = currentStep > 1
     ? (stepMessages[currentStep]?.(normalizedLead) || message)
     : message;

   // Prefer templates by category; fallback to generic/all categories.
  const dbStepTemplate = useMemo(() => {
    if (sequenceTemplates.length > 0 && nextDue?.step) {
      return sequenceTemplates.find((template) => Math.max(1, toInt(template?.step_number, 1)) === nextDue.step) || sequenceTemplates[0] || null;
    }
    return relevantTemplates[0] || null;
  }, [sequenceTemplates, nextDue, relevantTemplates]);

  const fillPlaceholders = (msg) => msg
    .replace(/{customer_name}/g, normalizedLead.customer_name || '')
    .replace(/{name}/g, normalizedLead.customer_name || '')
    .replace(/{ppl}/g, isGreenForms ? (resolvedCarModel || '') : (normalizedLead.ppl || ''))
    .replace(/{pl}/g, normalizedLead.pl || '')
    .replace(/{ca_name}/g, isGreenForms ? (resolvedGreenFormOwnerName || '') : (normalizedLead.ca_name || ''))
    .replace(/{car}/g, isGreenForms ? (resolvedCarModel || normalizedLead.ppl || 'car') : (normalizedLead.ppl || resolvedCarModel || 'car'));

  const resolvedDefault = dbStepTemplate
    ? fillPlaceholders(dbStepTemplate.template_text)
    : defaultMessage;

  const activeMessage = selectedTemplateId === 'default'
    ? resolvedDefault
    : (() => {
        const t = templates?.find(t => t.id === selectedTemplateId);
        if (!t) return resolvedDefault;
        return fillPlaceholders(t.template_text);
      })();

  const waLink = buildWhatsAppUrl(resolvedPhone, activeMessage);
  const callLink = buildCallUrl(resolvedPhone);

  // Templates are now pure text; no attachment field in operational schema.
  const activeTemplateObj = selectedTemplateId === 'default'
    ? dbStepTemplate
    : templates?.find(t => t.id === selectedTemplateId);

  const handleSend = () => {
    if (!waLink) return;
    window.open(waLink, '_blank', 'noopener,noreferrer');
    onMarkSent({
      lead,
      leadType: tab,
      messageText: activeMessage,
      templateId: activeTemplateObj?.id ?? null,
    });
  };

  const handleCall = () => {
    if (!callLink) return;
    window.location.href = callLink;
  };

  // Determine badge for follow-up status
  const days = sequenceTemplates.length > 0
    ? sequenceTemplates.map((template, index) => Math.max(1, toInt(template?.step_number, index + 1)))
    : (tab === 'matchtalk' ? MATCHTALK_FOLLOW_UP_DAYS : FOLLOW_UP_DAYS);
  const dueLabel = sequenceTemplates.length > 0 ? 'Step' : 'Day';
  const sentCount = historyForLead.length;
  const sentSteps = new Set(days.slice(0, sentCount));

  return (
    <div className={cn(
      "rounded-2xl p-4 shadow-sm border transition-all",
      "bg-white dark:bg-gray-800",
      "dark:border-gray-700",
      allDone ? "border-gray-200 dark:border-gray-700 opacity-60" : nextDue?.overdue ? "border-orange-300 dark:border-orange-900" : "border-gray-100 dark:border-gray-700"
    )}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <User className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm truncate">{normalizedLead.customer_name}</h3>
              {allDone && (
                <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full flex-shrink-0">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  Sequence Done
                </span>
              )}
              {nextDue?.overdue && (
                <span className="flex items-center gap-1 text-[10px] font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 px-1.5 py-0.5 rounded-full flex-shrink-0">
                  <Clock className="w-2.5 h-2.5" />
                  Follow-up Due
                </span>
              )}
            </div>
            {resolvedCarModel && (
              <div className="flex items-center gap-1.5 mb-1">
                <Car className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{resolvedCarModel}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
              <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{resolvedPhone}</span>
            </div>

            {/* Step progress pills */}
            {isSent && (
              <div className="flex items-center gap-1.5 mt-2">
                {days.map(day => (
                  <span
                    key={day}
                    className={cn(
                      "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                      sentSteps.has(day)
                        ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                        : nextDue?.step === day && nextDue?.overdue
                        ? "bg-orange-50 text-orange-600 border-orange-200"
                        : "bg-gray-50 text-gray-400 border-gray-200"
                    )}
                  >
                    {dueLabel} {day}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
              {tab === 'vana' && (
                <div className="mt-2 space-y-1 w-full">
                  {[
                    ['Model', typeof normalizedLead.product_line === 'string' ? (normalizedLead.product_line.trim() || '-') : (normalizedLead.product_line ?? '-')],
                    ['Sales Person', typeof normalizedLead.sales_team === 'string' ? (normalizedLead.sales_team.trim() || '-') : (normalizedLead.sales_team ?? '-')],
                    ['Booking ID', normalizedLead.booking_id],
                    ['Chassis No', normalizedLead.chassis_no],
                    ['PPL', normalizedLead.ppl],
                    ['PL', normalizedLead.pl],
                    ['Colour', normalizedLead.colour],
                    ['CA Name', normalizedLead.ca_name],
                    ['Opty ID', normalizedLead.opty_id],
                    ['VC #', normalizedLead.vc_number],
                    ['YF Open Date', normalizedLead.yf_open_date],
                    ['Branch', normalizedLead.branch],
                    ['TL Name', normalizedLead.tl_name],
                    ['Allocation Status', normalizedLead.allocation_status],
                  ].filter(([, val]) => val).map(([label, val]) => (
                    <div key={label} className="flex items-center gap-1.5 text-xs">
                      <span className="text-gray-400 dark:text-gray-500 w-28 flex-shrink-0">{label}:</span>
                      <span className="text-gray-700 dark:text-gray-200 font-medium truncate">{val}</span>
                    </div>
                  ))}
                </div>
              )}

            {tab === 'matchtalk' && (
                <div className="mt-2 space-y-1 w-full">
                  {[
                    ['Model', typeof normalizedLead.product_line === 'string' ? (normalizedLead.product_line.trim() || '-') : (normalizedLead.product_line ?? '-')],
                    ['Sales Person', typeof normalizedLead.sales_team === 'string' ? (normalizedLead.sales_team.trim() || '-') : (normalizedLead.sales_team ?? '-')],
                    ['Chassis No', normalizedLead.chassis_no],
                    ['PPL', normalizedLead.ppl],
                    ['PL', normalizedLead.pl],
                    ['Colour', normalizedLead.colour],
                    ['CA Name', normalizedLead.ca_name],
                    ['No Status', normalizedLead.no_status],
                    ['VC #', normalizedLead.vc_number],
                    ['Finance Remark', normalizedLead.finance_remark],
                    ['Opty ID', normalizedLead.opty_id],
                  ].filter(([, val]) => val).map(([label, val]) => (
                    <div key={label} className="flex items-center gap-1.5 text-xs">
                      <span className="text-gray-400 w-24 flex-shrink-0">{label}:</span>
                      <span className="text-gray-700 font-medium truncate">{val}</span>
                    </div>
                  ))}
                </div>
              )}

            {tab === 'greenforms' && (resolvedCarModel || resolvedGreenFormSource || resolvedGreenFormOwnerName || resolvedGreenFormOwnerId) && (
                <div className="mt-1.5 space-y-0.5 w-full">
                  {[
                    ['Model', resolvedCarModel],
                    ['Source', resolvedGreenFormSource],
                    ['Employee', resolvedGreenFormOwnerName],
                  ].filter(([, val]) => val).map(([label, val]) => (
                    <div key={label} className="flex items-center gap-1.5 text-xs">
                      <span className="text-gray-400 w-14 flex-shrink-0">{label}:</span>
                      <span className="text-gray-700 font-medium truncate">{val}</span>
                    </div>
                  ))}
                </div>
              )}
            {(isGreenForms ? resolvedGreenFormSource : normalizedLead.lead_source) && (
                <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {isGreenForms ? resolvedGreenFormSource : normalizedLead.lead_source}
                </span>
              )}
              {(isGreenForms ? resolvedGreenFormOwnerId : normalizedLead.assigned_to) && (
                <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                  👤 {isGreenForms ? resolvedGreenFormOwnerId : normalizedLead.assigned_to.split('@')[0]}
                </span>
              )}
              {!allDone && nextDue && nextDue.step > 1 && !nextDue.overdue && (
                <span className="text-[10px] font-medium text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
                  {dueLabel} {nextDue.step} in {nextDue.daysUntil}d
                </span>
              )}
            </div>

            {relevantTemplates.length > 0 && !allDone && (
              <div className="mt-2">
                <UIDrawer>
                  <UIDrawerTrigger asChild>
                    <UIButton variant="outline" className="w-full h-7 text-[11px] rounded-lg border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 dark:text-gray-100 justify-start">
                      {selectedTemplateId === 'default' && dbStepTemplate ? `📋 ${dbStepTemplate.name}` : `Default (${dueLabel} ${currentStep})`}
                    </UIButton>
                  </UIDrawerTrigger>
                  <UIDrawerContent>
                    <div className="p-4 space-y-2">
                      <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Select Template</h3>
                      <button
                        onClick={() => setSelectedTemplateId('default')}
                        className={`w-full text-left py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                          selectedTemplateId === 'default'
                            ? 'bg-gray-900 dark:bg-gray-700 text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200'
                        }`}
                      >
                        {dbStepTemplate ? `📋 ${dbStepTemplate.name}` : `Default (${dueLabel} ${currentStep})`}
                      </button>
                      {relevantTemplates
                        .filter(t => t.id !== dbStepTemplate?.id)
                        .map(t => (
                          <button
                            key={t.id}
                            onClick={() => setSelectedTemplateId(t.id)}
                            className={`w-full text-left py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                              selectedTemplateId === t.id
                                ? 'bg-gray-900 dark:bg-gray-700 text-white'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200'
                            }`}
                          >
                            {t.name}
                          </button>
                        ))}
                    </div>
                  </UIDrawerContent>
                </UIDrawer>
              </div>
            )}
          </div>
        </div>
        {!allDone && (
          <div className="flex items-start gap-2 flex-shrink-0">
            <UIButton
              onClick={handleCall}
              variant="outline"
              className="rounded-xl h-12 w-12 p-0 shadow-lg"
              aria-label="Call"
              title="Call"
              disabled={!callLink}
            >
              <PhoneCall className="w-5 h-5" />
            </UIButton>
            <div className="flex flex-col items-center gap-1">
              <UIButton
                onClick={handleSend}
                className={cn(
                  "rounded-xl h-12 w-12 p-0 shadow-lg",
                  nextDue?.overdue ? "bg-orange-500 hover:bg-orange-600" : accentColor
                )}
                disabled={!waLink}
              >
                <MessageCircle className="w-5 h-5" />
              </UIButton>
              <span className="text-[9px] font-bold text-gray-400">{dueLabel} {currentStep}</span>
            </div>
          </div>
        )}
        {allDone && (
          <div className="h-12 w-12 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-7 h-7 text-emerald-400" />
          </div>
        )}
      </div>
    </div>
  );
}