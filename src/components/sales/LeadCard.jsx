import React, { useState, useEffect } from 'react';
import { MessageCircle, CheckCircle2, Car, Phone, User, Clock, Paperclip, FileText, ImageIcon } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { differenceInDays } from 'date-fns';
import { getNormalizedLead } from './leadDataHelper';

// Follow-up sequence: day 1 (initial), day 2, day 5
const FOLLOW_UP_DAYS = [1, 2, 5];
const MATCHTALK_FOLLOW_UP_DAYS = [1, 2, 4];

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
    1: (lead) => `Hello ${lead.customer_name},\n\nThank you for your interest in the ${lead.car_model || 'car'}.\n\nOur team would be happy to assist you with details or a test drive.\n\nPlease let us know how we can help.`,
    2: (lead) => `Hello ${lead.customer_name},\n\nFollowing up on your inquiry about the ${lead.car_model || 'car'}.\nWould you like to book a test drive or get a quote?\n\nThank you.`,
    5: (lead) => `Hello ${lead.customer_name},\n\nWe're reaching out once more regarding the ${lead.car_model || 'car'}.\nOur team is ready to assist you whenever you're ready.\n\nThank you.`,
  },
};

function getDaysSinceFirstSent(sentMessages, leadId, tab) {
  const first = sentMessages
    .filter(m => m.lead_id === leadId && m.tab === tab && (m.day_step === 1 || !m.day_step))
    .sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at))[0];
  if (!first?.sent_at) return null;
  return differenceInDays(new Date(), new Date(first.sent_at));
}

function getNextDueStep(sentMessages, leadId, tab) {
  const sentSteps = new Set(
    sentMessages
      .filter(m => m.lead_id === leadId && m.tab === tab)
      .map(m => m.day_step || 1)
  );
  const daysSince = getDaysSinceFirstSent(sentMessages, leadId, tab);
  const days = tab === 'matchtalk' ? MATCHTALK_FOLLOW_UP_DAYS : FOLLOW_UP_DAYS;

  for (const day of days) {
    if (!sentSteps.has(day)) {
      if (day === 1) return { step: 1, daysUntil: 0, overdue: false };
      if (daysSince !== null && daysSince >= day) return { step: day, daysUntil: 0, overdue: true };
      if (daysSince !== null) return { step: day, daysUntil: day - daysSince, overdue: false };
      return null;
    }
  }
  return null; // all steps done
}

export default function LeadCard({ lead, tab, accentColor, message, isSent, onMarkSent, templates, sentMessages = [] }) {
   const [selectedTemplateId, setSelectedTemplateId] = useState('default');
   const normalizedLead = getNormalizedLead(lead);

   const nextDue = getNextDueStep(sentMessages, lead.id, tab);
   const allDone = !nextDue;

   // For current step, pick the right message
   const stepMessages = FOLLOW_UP_MESSAGES[tab] || FOLLOW_UP_MESSAGES.greenforms;
   const currentStep = nextDue?.step || 1;
   const defaultMessage = currentStep > 1
     ? (stepMessages[currentStep]?.(normalizedLead) || message)
     : message;

   // Check if there's a DB template for current tab + day_step
   // Prefer PPL-specific match, fallback to no-PPL template
   const leadPpl = (normalizedLead.ppl || '').toLowerCase().trim();
  const dbStepTemplate = (() => {
    const candidates = templates?.filter(t => {
      const tabMatch = t.tab === tab || t.tab === 'all';
      const stepMatch = Number(t.day_step) === currentStep;
      return tabMatch && stepMatch;
    }) || [];
    
    if (candidates.length === 0) return null;
    
    // First try exact PPL match (case-insensitive, trimmed)
    if (leadPpl) {
      const pplMatch = candidates.find(t => t.ppl && t.ppl.toLowerCase().trim() === leadPpl);
      if (pplMatch) return pplMatch;
    }
    
    // Fallback: no PPL set (applies to all)
    const genericMatch = candidates.find(t => !t.ppl || t.ppl.toLowerCase().trim() === '');
    return genericMatch || candidates[0];
  })();

  const fillPlaceholders = (msg) => msg
    .replace(/{customer_name}/g, normalizedLead.customer_name || '')
    .replace(/{name}/g, normalizedLead.customer_name || '')
    .replace(/{ppl}/g, normalizedLead.ppl || '')
    .replace(/{pl}/g, normalizedLead.pl || '')
    .replace(/{ca_name}/g, normalizedLead.ca_name || '')
    .replace(/{car}/g, normalizedLead.ppl || normalizedLead.car_model || 'car');

  const resolvedDefault = dbStepTemplate
    ? fillPlaceholders(dbStepTemplate.message)
    : defaultMessage;

  const activeMessage = selectedTemplateId === 'default'
    ? resolvedDefault
    : (() => {
        const t = templates?.find(t => t.id === selectedTemplateId);
        if (!t) return resolvedDefault;
        return fillPlaceholders(t.message);
      })();

  const phone = normalizedLead.phone_number?.replace(/[^0-9+]/g, '').replace(/^\+/, '');
  const waLink = `https://wa.me/${phone}?text=${encodeURIComponent(activeMessage)}`;

  // Attachments from the active template
  const activeTemplateObj = selectedTemplateId === 'default'
    ? dbStepTemplate
    : templates?.find(t => t.id === selectedTemplateId);
  const attachments = activeTemplateObj?.attachments?.length ? activeTemplateObj.attachments : [];

  const handleSend = () => {
    window.open(waLink, '_blank');
    const caName = tab === 'greenforms'
      ? (normalizedLead.employee_full_name || normalizedLead.ca_name || '')
      : (normalizedLead.ca_name || '');
    onMarkSent(lead.id, tab, currentStep, caName);
  };

  // Determine badge for follow-up status
  const sentSteps = new Set(
    sentMessages
      .filter(m => m.lead_id === lead.id && m.tab === tab)
      .map(m => m.day_step || 1)
  );

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
            {normalizedLead.car_model && (
              <div className="flex items-center gap-1.5 mb-1">
                <Car className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{normalizedLead.car_model}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
              <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{normalizedLead.phone_number}</span>
            </div>

            {/* Step progress pills */}
            {isSent && (
              <div className="flex items-center gap-1.5 mt-2">
                {(tab === 'matchtalk' ? MATCHTALK_FOLLOW_UP_DAYS : FOLLOW_UP_DAYS).map(day => (
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
                    Day {day}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
              {tab === 'vana' && (
                <div className="mt-2 space-y-1 w-full">
                  {[
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

            {tab === 'greenforms' && (normalizedLead.ppl || normalizedLead.source_pv || normalizedLead.employee_full_name) && (
                <div className="mt-1.5 space-y-0.5 w-full">
                  {[
                    ['PPL', normalizedLead.ppl],
                    ['Source', normalizedLead.source_pv],
                    ['Employee', normalizedLead.employee_full_name],
                  ].filter(([, val]) => val).map(([label, val]) => (
                    <div key={label} className="flex items-center gap-1.5 text-xs">
                      <span className="text-gray-400 w-14 flex-shrink-0">{label}:</span>
                      <span className="text-gray-700 font-medium truncate">{val}</span>
                    </div>
                  ))}
                </div>
              )}
            {normalizedLead.lead_source && (
                <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {normalizedLead.lead_source}
                </span>
              )}
              {normalizedLead.assigned_to && (
                <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                  👤 {normalizedLead.assigned_to.split('@')[0]}
                </span>
              )}
              {!allDone && nextDue && nextDue.step > 1 && !nextDue.overdue && (
                <span className="text-[10px] font-medium text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
                  Day {nextDue.step} in {nextDue.daysUntil}d
                </span>
              )}
            </div>

            {templates?.length > 0 && !allDone && (
              <div className="mt-2">
                <Drawer>
                  <DrawerTrigger asChild>
                    <Button variant="outline" className="w-full h-7 text-[11px] rounded-lg border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 dark:text-gray-100 justify-start">
                      {selectedTemplateId === 'default' && dbStepTemplate ? `📋 ${dbStepTemplate.name}` : `Default (Day ${currentStep})`}
                    </Button>
                  </DrawerTrigger>
                  <DrawerContent>
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
                        {dbStepTemplate ? `📋 ${dbStepTemplate.name}` : `Default (Day ${currentStep})`}
                      </button>
                      {templates
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
                            Day {t.day_step} — {t.name}
                          </button>
                        ))}
                    </div>
                  </DrawerContent>
                </Drawer>
              </div>
            )}
          </div>
        </div>
        {!allDone && attachments.length > 0 && (
          <div className="w-full mt-2 space-y-1 basis-full">
            <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 flex items-center gap-1"><Paperclip className="w-3 h-3" /> Attachments — open & share on WhatsApp:</p>
            {attachments.map((url, idx) => {
              const isPdf = url.toLowerCase().includes('.pdf');
              const name = url.split('/').pop().split('?')[0] || `File ${idx + 1}`;
              return (
                <a key={idx} href={url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-lg px-2.5 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 transition-all">
                  {isPdf ? <FileText className="w-3.5 h-3.5 text-red-400 dark:text-red-500 flex-shrink-0" /> : <ImageIcon className="w-3.5 h-3.5 text-blue-400 dark:text-blue-500 flex-shrink-0" />}
                  <span className="text-xs text-gray-600 dark:text-gray-200 truncate flex-1">{name}</span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">Tap to open</span>
                </a>
              );
            })}
          </div>
        )}
        {!allDone && (
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <Button
              onClick={handleSend}
              className={cn(
                "rounded-xl h-12 w-12 p-0 shadow-lg",
                nextDue?.overdue ? "bg-orange-500 hover:bg-orange-600" : accentColor
              )}
            >
              <MessageCircle className="w-5 h-5" />
            </Button>
            <span className="text-[9px] font-bold text-gray-400">Day {currentStep}</span>
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