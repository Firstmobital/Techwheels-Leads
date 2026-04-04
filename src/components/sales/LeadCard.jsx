// @ts-nocheck
import React, { useMemo, useState } from'react';
import { MessageCircle, CheckCircle2, Car, Phone, User, Clock, PhoneCall, ChevronDown, ChevronUp, MessageSquare } from'lucide-react';
import { Button } from"@/components/ui/button";
import { cn } from"@/lib/utils";
import { differenceInDays } from'date-fns';
import { getNormalizedLead } from'./leadDataHelper';
import { matchesSentMessageToLead } from'@/utils/sentMessageUtils';
import { buildCallUrl, buildWhatsAppUrl } from'@/utils/phone';
import { supabaseApi } from'@/api/supabaseService';
import { useMutation, useQueryClient } from'@tanstack/react-query';
import { useCurrentUser } from'@/lib/CurrentUserContext';

const UIButton = /** @type {any} */ (Button);

// Legacy day-based follow-up sequence (used when templates don't define delay/step).
const FOLLOW_UP_DAYS = [1, 2, 5];
const MATCHTALK_FOLLOW_UP_DAYS = [1, 2, 4];

const CATEGORY_ALIASES = {
 vana: ['vana','vna'],
 matchtalk: ['matchtalk','match_stock','match'],
 greenforms: ['greenforms','green_forms','greenform'],
 ai_leads: ['ai_leads','ai-leads','ai'],
};

const toInt = (value, fallback) => {
 const parsed = Number.parseInt(String(value ??'').trim(), 10);
 return Number.isFinite(parsed) ? parsed : fallback;
};

const toCanonicalCategory = (value) => {
 const token = String(value ||'').trim().toLowerCase();
 if (!token) return'';
 if (token ==='all' || token ==='general') return token;
 const entry = Object.entries(CATEGORY_ALIASES).find(([, aliases]) => aliases.includes(token));
 return entry ? entry[0] : token;
};

const getTemplateCategory = (template) => {
 const rawCategory = template?.category;
 const rawSource = template?.source;
 return toCanonicalCategory(rawCategory || rawSource ||'');
};

const FOLLOW_UP_MESSAGES = {
 vana: {
 1: (lead) =>`Hello ${lead.customer_name},\n\nWe currently do not have the ${lead.car_model ||'car'} available.\nWe will inform you as soon as it becomes available.\n\nThank you.`,
 2: (lead) =>`Hello ${lead.customer_name},\n\nJust following up on your interest in the ${lead.car_model ||'car'}.\nWe're still working on getting it available for you.\n\nThank you for your patience.`,
 5: (lead) =>`Hello ${lead.customer_name},\n\nWe wanted to check back regarding the ${lead.car_model ||'car'}.\nIs there anything else we can help you with in the meantime?\n\nThank you.`,
 },
 matchtalk: {
 1: (lead) =>`Booking Name: ${lead.customer_name}\nCar Model: ${lead.ppl ||''}\nVariant: ${lead.pl ||''}\nSales Advisor: ${lead.ca_name ||''}\nContact No.: \n\nWe are pleased to inform you that your vehicle is now available for billing and the chassis number has been allotted.\n\nKindly proceed with the billing and RTO formalities at the earliest. As per company policy, we can hold the vehicle for 4 working days only.\n\nIf you are not planning to take delivery within the next 7 days, we kindly request you to inform us and allow us to allocate the vehicle to the next waiting customer.\n\nWe truly appreciate your understanding and look forward to assisting you with the delivery.\n\nThank you.`,
 2: (lead) =>`Booking Name: ${lead.customer_name}\nCar Model: ${lead.ppl ||''}\nVariant: ${lead.pl ||''}\nSales Advisor: ${lead.ca_name ||''}\nContact No.: \n\nहमें आपको यह बताते हुए खुशी हो रही है कि आपकी गाड़ी अब बिलिंग के लिए उपलब्ध है और उसका चेसिस नंबर अलॉट हो चुका है।\n\nकृपया जल्द से जल्द बिलिंग और RTO की औपचारिकताएं पूरी करें। कंपनी की पॉलिसी के अनुसार हम वाहन को केवल 4 कार्य दिवसों तक ही होल्ड कर सकते हैं।\n\nयदि आप अगले 7 दिनों के भीतर डिलीवरी लेने की योजना नहीं बना रहे हैं, तो कृपया हमें सूचित करें ताकि हम इस वाहन को अगले वेटिंग ग्राहक को अलॉट कर सकें।\n\nआपके सहयोग के लिए हम आभारी हैं और आपकी गाड़ी की डिलीवरी में सहायता करने के लिए उत्सुक हैं।\n\nधन्यवाद।`,
 4: (lead) =>`Booking Name: ${lead.customer_name}\nCar Model: ${lead.ppl ||''}\nVariant: ${lead.pl ||''}\nSales Advisor: ${lead.ca_name ||''}\nContact No.: \n\nThis is a reminder that your vehicle is still awaiting billing. We have already communicated the urgency earlier.\n\nKindly complete the billing and RTO formalities immediately to avoid reallocation.\n\nThank you.`,
 },
 greenforms: {
 1: (lead) =>`Hello ${lead.customer_name},\n\nThank you for your interest in the ${lead.model_name || lead.car_model || lead.ppl ||'car'}.\n\nOur team would be happy to assist you with details or a test drive.\n\nPlease let us know how we can help.`,
 2: (lead) =>`Hello ${lead.customer_name},\n\nFollowing up on your inquiry about the ${lead.model_name || lead.car_model || lead.ppl ||'car'}.\nWould you like to book a test drive or get a quote?\n\nThank you.`,
 5: (lead) =>`Hello ${lead.customer_name},\n\nWe're reaching out once more regarding the ${lead.model_name || lead.car_model || lead.ppl ||'car'}.\nOur team is ready to assist you whenever you're ready.\n\nThank you.`,
 },
};

// Response outcome options for logging customer replies
const RESPONSE_OUTCOMES = [
 { value:'interested', label:'Interested', color:'text-green-700 bg-green-50 border-green-200' },
 { value:'callback', label:'Call Back', color:'text-blue-700 bg-blue-50 border-blue-200' },
 { value:'not_reachable', label:'Not Reachable', color:'text-orange-700 bg-orange-50 border-orange-200' },
 { value:'not_interested', label:'Not Interested', color:'text-red-700 bg-red-50 border-red-200' },
 { value:'already_billed', label:'Already Billed', color:'text-purple-700 bg-purple-50 border-purple-200' },
];

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

 const days = tab ==='matchtalk' ? MATCHTALK_FOLLOW_UP_DAYS : FOLLOW_UP_DAYS;

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

// ─── Response Log Panel ────────────────────────────────────────────────────────
function ResponseLogPanel({ lead, tab, onClose }) {
 const { currentUser } = useCurrentUser();
 const queryClient = useQueryClient();
 const [selectedOutcome, setSelectedOutcome] = useState('');
 const [note, setNote] = useState('');
 const [saved, setSaved] = useState(false);

 const saveResponseMutation = useMutation({
 mutationFn: (/** @type {{ outcome: string, text: string }} */ payload) => supabaseApi.entities.LeadNote
 ? supabaseApi.leadNotes.addNote(
 lead.id,
 currentUser?.employeeId ?? null,
'response_logged',
 payload.text
 )
 : supabaseApi.entities.SentMessage.create({
 customer_name: lead?.customer_name || null,
 mobile_number: lead?.mobile_number || lead?.phone_number ||'',
 message_text: payload.text,
 lead_source: tab ==='vana' ?'vna' : tab ==='matchtalk' ?'matchtalk' :'walkin',
 source_record_id: lead?.id ? String(lead.id) : null,
 sent_by_employee_id: currentUser?.employeeId ?? null,
 sent_via:'response_log',
 status: payload.outcome,
 }),
 onSuccess: () => {
 setSaved(true);
 queryClient.invalidateQueries({ queryKey: ['sent-messages'] });
 setTimeout(() => { setSaved(false); onClose(); }, 1200);
 },
 });

 const handleSave = () => {
 if (!selectedOutcome) return;
 const outcomeLabel = RESPONSE_OUTCOMES.find(o => o.value === selectedOutcome)?.label || selectedOutcome;
 const text = note.trim()
 ?`${outcomeLabel}: ${note.trim()}`
 : outcomeLabel;
 saveResponseMutation.mutate({ outcome: selectedOutcome, text });
 };

 return (
 <div className="mt-3 pt-3 border-t border-gray-100">
 <div className="flex items-center justify-between mb-2">
 <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
 Log Customer Response
 </span>
 <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
 </div>
 <div className="flex flex-wrap gap-1.5 mb-2">
 {RESPONSE_OUTCOMES.map(o => (
 <button
 key={o.value}
 onClick={() => setSelectedOutcome(o.value)}
 className={cn(
'text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all',
 selectedOutcome === o.value
 ? o.color +' ring-1 ring-offset-1 ring-current'
 :'text-gray-500 bg-gray-50 border-gray-200'
 )}
 >
 {o.label}
 </button>
 ))}
 </div>
 <textarea
 rows={2}
 value={note}
 onChange={e => setNote(e.target.value)}
 placeholder="Optional note (e.g.'will come Saturday')..."
 className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
 />
 <UIButton
 size="sm"
 onClick={handleSave}
 disabled={!selectedOutcome || saveResponseMutation.isPending || saved}
 className={cn(
'mt-2 w-full h-8 text-xs rounded-xl',
 saved ?'bg-green-500 text-white' :'bg-gray-900 text-white'
 )}
 >
 {saved ?'✓ Saved' : saveResponseMutation.isPending ?'Saving...' :'Save Response'}
 </UIButton>
 </div>
 );
}

export default function LeadCard({ lead, tab, accentColor, message, isSent, onMarkSent, templates, sentMessages = [] }) {
 const normalizedLead = getNormalizedLead(lead);
 const [showResponseLog, setShowResponseLog] = useState(false);

 const isTemplateDrivenTab = tab ==='vana' || tab ==='matchtalk' || tab ==='greenforms';
 const isGreenForms = tab ==='greenforms';
 const resolvedPhone = isGreenForms
 ? (normalizedLead.mobile_number || normalizedLead.phone_number ||'')
 : (normalizedLead.phone_number || normalizedLead.mobile_number ||'');
 const resolvedCarModel = isGreenForms
 ? (normalizedLead.model_name || normalizedLead.car_model || normalizedLead.ppl)
 : (normalizedLead.car_model || normalizedLead.model_name || normalizedLead.ppl);
 const resolvedGreenFormSource = normalizedLead.source_type || normalizedLead.source_pv ||'';
 const resolvedGreenFormOwnerId = normalizedLead.salesperson_id || normalizedLead.assigned_to ||'';
 const resolvedGreenFormOwnerName = normalizedLead.employee_full_name || normalizedLead.ca_name ||'';

 const relevantTemplates = useMemo(() => {
 const safeTemplates = Array.isArray(templates) ? templates : [];
 return safeTemplates.filter((template) => {
 if (template?.is_active === false) return false;
 const category = getTemplateCategory(template);
 return category === tab || category ==='all' || category ==='general';
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

 const dbStepTemplate = useMemo(() => {
 if (sequenceTemplates.length > 0 && nextDue?.step) {
 return sequenceTemplates.find((template) => Math.max(1, toInt(template?.step_number, 1)) === nextDue.step) || sequenceTemplates[0] || null;
 }
 return relevantTemplates[0] || null;
 }, [sequenceTemplates, nextDue, relevantTemplates]);

 // Resolve values once so all placeholder replacements use the same source
 const resolvedCaName = isGreenForms
 ? (resolvedGreenFormOwnerName || normalizedLead.ca_name ||'')
 : (normalizedLead.ca_name || normalizedLead.sales_team ||'');
 const resolvedPpl = resolvedCarModel || normalizedLead.ppl || normalizedLead.parent_product_line ||'';
 const resolvedPl = normalizedLead.pl || normalizedLead.product_line ||'';
 const resolvedColour = normalizedLead.colour || normalizedLead.product_description ||'';
 const resolvedChassisNo = normalizedLead.chassis_no ||'';

 const fillPlaceholders = (msg) => msg
 .replace(/{customer_name}/g, normalizedLead.customer_name ||'')
 .replace(/{name}/g, normalizedLead.customer_name ||'')
 // Model variables
 .replace(/{ppl}/g, resolvedPpl)
 .replace(/{model}/g, resolvedPpl)
 .replace(/{car}/g, resolvedPpl ||'car')
 // Variant variables
 .replace(/{pl}/g, resolvedPl)
 .replace(/{variant}/g, resolvedPl)
 // Sales person variables
 .replace(/{ca_name}/g, resolvedCaName)
 .replace(/{sales_person}/g, resolvedCaName)
 .replace(/{salesperson}/g, resolvedCaName)
 // Other variables
 .replace(/{colour}/g, resolvedColour)
 .replace(/{color}/g, resolvedColour)
 .replace(/{chassis_no}/g, resolvedChassisNo)
 .replace(/{chassis}/g, resolvedChassisNo);

 const resolvedDefault = dbStepTemplate
 ? fillPlaceholders(dbStepTemplate.template_text)
 : defaultMessage;

 const waLink = buildWhatsAppUrl(resolvedPhone, resolvedDefault);
 const callLink = buildCallUrl(resolvedPhone);

 const templateButtons = useMemo(() => {
 if (!isTemplateDrivenTab) return [];

 const withOrder = relevantTemplates
 .map((template, index) => {
 const stepNumber = toInt(template?.step_number, Number.NaN);
 const delayDays = toInt(template?.delay_days, Number.NaN);
 return {
 template,
 index,
 stepNumber: Number.isFinite(stepNumber) ? Math.max(1, stepNumber) : Number.POSITIVE_INFINITY,
 delayDays: Number.isFinite(delayDays) ? Math.max(0, delayDays) : Number.POSITIVE_INFINITY,
 };
 })
 .sort((a, b) => {
 if (a.stepNumber !== b.stepNumber) return a.stepNumber - b.stepNumber;
 if (a.delayDays !== b.delayDays) return a.delayDays - b.delayDays;
 const aName = String(a.template?.name ??'').trim().toLowerCase();
 const bName = String(b.template?.name ??'').trim().toLowerCase();
 if (aName && bName && aName !== bName) return aName.localeCompare(bName);
 return a.index - b.index;
 });

 return withOrder.map(({ template }, index) => {
 const label =`M${index + 1}`;
 return {
 template,
 label,
 messageText: fillPlaceholders(template?.template_text ||''),
 };
 });
 }, [isTemplateDrivenTab, relevantTemplates, fillPlaceholders]);

 const handleSend = (messageText, template) => {
 const sendLink = buildWhatsAppUrl(resolvedPhone, messageText);
 if (!sendLink) return;
 window.open(sendLink,'_blank','noopener,noreferrer');
 onMarkSent({
 lead,
 leadType: tab,
 messageText,
 templateId: template?.id ?? null,
 });
 };

 const handleCall = () => {
 if (!callLink) return;
 window.location.href = callLink;
 };

 // Step progress dots — total steps in the sequence.
 // Use sequenceTemplates count if available, then fall back to the actual number
 // of relevant templates for this tab. Only use the legacy FOLLOW_UP_DAYS length
 // as a last resort when there are no templates configured at all.
 const totalSteps = sequenceTemplates.length > 0
   ? sequenceTemplates.length
   : relevantTemplates.length > 0
     ? relevantTemplates.length
     : (tab ==='matchtalk' ? MATCHTALK_FOLLOW_UP_DAYS : FOLLOW_UP_DAYS).length;
 const sentCount = historyForLead.length;

 // Urgency level for border color
 const urgencyBorder = nextDue?.overdue
 ?'border-l-2 border-l-red-500'
 : (!allDone && nextDue?.daysUntil === 0)
 ?'border-l-2 border-l-green-500'
 :'';

 // Overdue days label
 const overdueDays = nextDue?.overdue
 ? getDaysSinceFirstSent(historyForLead) !== null
 ? getDaysSinceFirstSent(historyForLead) - (sequenceTemplates[sentCount - 1]?.delay_days ?? (tab ==='matchtalk' ? MATCHTALK_FOLLOW_UP_DAYS : FOLLOW_UP_DAYS)[sentCount - 1] ?? 0)
 : null
 : null;

 // Step label for WA button 
 const nextStepLabel = sequenceTemplates.length > 0 && nextDue?.step
 ?`M${sequenceTemplates.findIndex(t => toInt(t.step_number, 0) === nextDue.step) + 1}`
 : nextDue?.step ?`Step ${nextDue.step}` : null;

 const days = sequenceTemplates.length > 0
 ? sequenceTemplates.map((template, index) => Math.max(1, toInt(template?.step_number, index + 1)))
 : (tab ==='matchtalk' ? MATCHTALK_FOLLOW_UP_DAYS : FOLLOW_UP_DAYS);
 const dueLabel = sequenceTemplates.length > 0 ?'Step' :'Day';
 const sentSteps = new Set(days.slice(0, sentCount));

 return (
 <div className={cn(
"rounded-2xl shadow-sm border transition-all bg-white overflow-hidden",
 allDone ?"border-gray-200 opacity-70" : nextDue?.overdue ?"border-red-200" :"border-gray-100",
 urgencyBorder
 )}>
 <div className="p-4">
 {/* Header row */}
 <div className="flex items-start justify-between gap-3 flex-wrap">
 <div className="flex-1 min-w-0">

 {/* Name + status badges */}
 <div className="flex items-center gap-2 mb-1 flex-wrap">
 <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
 <h3 className="font-semibold text-gray-900 text-sm truncate">{normalizedLead.customer_name}</h3>
 {allDone && (
 <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex-shrink-0">
 <CheckCircle2 className="w-2.5 h-2.5" />
 Done
 </span>
 )}
 {nextDue?.overdue && (
 <span className="flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full flex-shrink-0">
 <Clock className="w-2.5 h-2.5" />
 {overdueDays && overdueDays > 0 ?`${overdueDays}d overdue` :'Overdue'}
 </span>
 )}
 {!allDone && !nextDue?.overdue && nextDue?.daysUntil === 0 && (
 <span className="text-[10px] font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full flex-shrink-0">
 Due today
 </span>
 )}
 {!allDone && nextDue?.daysUntil > 0 && (
 <span className="text-[10px] font-medium text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full flex-shrink-0">
 {nextStepLabel} in {nextDue.daysUntil}d
 </span>
 )}
 {!allDone && isTemplateDrivenTab && totalSteps > 0 && (
 <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">
 Step {Math.min(sentCount + 1, totalSteps)} / {totalSteps}
 </span>
 )}
 </div>

 {/* Car model */}
 {resolvedCarModel && (
 <div className="flex items-center gap-1.5 mb-1">
 <Car className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
 <span className="text-xs text-gray-600 truncate">{resolvedCarModel}</span>
 </div>
 )}

 {/* Phone */}
 <div className="flex items-center gap-1.5">
 <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
 <span className="text-xs text-gray-500 font-mono">{resolvedPhone}</span>
 </div>

 {/* ── Step progress dots ── */}
 {isTemplateDrivenTab && totalSteps > 0 && (
 <div className="flex items-center gap-1.5 mt-2.5">
 {Array.from({ length: totalSteps }).map((_, i) => {
 const isDone = i < sentCount;
 const isNext = i === sentCount && !allDone;
 return (
 <React.Fragment key={i}>
 <div className={cn(
'w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold border flex-shrink-0 transition-all',
 isDone
 ?'bg-emerald-500 border-emerald-500 text-white'
 : isNext && nextDue?.overdue
 ?'bg-red-50 border-red-400 text-red-600'
 : isNext && nextDue?.daysUntil === 0
 ?'bg-orange-50 border-orange-400 text-orange-600'
 : isNext
 ?'bg-blue-50 border-blue-400 text-blue-600'
 :'bg-gray-50 border-gray-200 text-gray-400'
 )}>
 {isDone ?'✓' :`M${i + 1}`}
 </div>
 {i < totalSteps - 1 && (
 <div className={cn('h-px flex-1', isDone ?'bg-emerald-300' :'bg-gray-200')} />
 )}
 </React.Fragment>
 );
 })}
 </div>
 )}

 </div>

 {/* Action buttons */}
 {((!isTemplateDrivenTab && !allDone) || isTemplateDrivenTab) && (
 <div className="flex items-start gap-2 flex-shrink-0">
 <UIButton
 onClick={handleCall}
 variant="outline"
 className="rounded-xl h-12 w-12 p-0 shadow-sm"
 aria-label="Call"
 title="Call"
 disabled={!callLink}
 >
 <PhoneCall className="w-5 h-5" />
 </UIButton>

 {isTemplateDrivenTab ? (
 <div className="grid grid-cols-2 gap-1.5 min-w-[120px]">
 {templateButtons.map(({ template, label, messageText }, idx) => {
 const stepSent = idx < sentCount;
 const isNextStep = idx === sentCount;
 return (
 <UIButton
 key={template.id || label}
 onClick={() => handleSend(messageText, template)}
 className={cn(
'rounded-lg h-9 px-2 text-[11px] font-semibold shadow-sm',
 stepSent
 ?'bg-emerald-50 border border-emerald-300 text-emerald-700 hover:bg-emerald-100'
 : isNextStep && nextDue?.overdue
 ?'bg-red-500 hover:bg-red-600 text-white'
 : isNextStep && nextDue?.daysUntil === 0
 ?'bg-orange-500 hover:bg-orange-600 text-white'
 :'bg-green-600 hover:bg-green-700 text-white'
 )}
 disabled={!buildWhatsAppUrl(resolvedPhone, messageText)}
 title={`Send ${label}`}
 >
 {stepSent ?'✓' :''}{label}
 </UIButton>
 );
 })}
 </div>
 ) : (
 <div className="flex flex-col items-center gap-1">
 <UIButton
 onClick={() => handleSend(resolvedDefault, dbStepTemplate)}
 variant="outline"
 className={cn(
"rounded-xl h-12 w-12 p-0 shadow-sm border",
 nextDue?.overdue
 ?"bg-red-500 hover:bg-red-600 text-white border-red-500"
 :"bg-green-50 hover:bg-green-100 border-green-200 text-green-700"
 )}
 disabled={!waLink}
 >
 <MessageCircle className="w-5 h-5" />
 </UIButton>
 <span className="text-[9px] font-bold text-gray-400">{dueLabel} {currentStep}</span>
 </div>
 )}
 </div>
 )}

 {!isTemplateDrivenTab && allDone && (
 <div className="h-12 w-12 flex items-center justify-center flex-shrink-0">
 <CheckCircle2 className="w-7 h-7 text-emerald-400" />
 </div>
 )}
 </div>


        {/* ── Extra fields — full width below header ── */}
        {(tab === 'vna' || tab === 'vana') && (
          <div className="mt-3 space-y-1 w-full">
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
                <span className="text-gray-400 w-28 flex-shrink-0">{label}:</span>
                <span className="text-gray-700 font-medium">{val}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'matchtalk' && (
          <div className="mt-3 space-y-1 w-full">
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
                <span className="text-gray-400 w-28 flex-shrink-0">{label}:</span>
                <span className="text-gray-700 font-medium">{val}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'greenforms' && (resolvedCarModel || resolvedGreenFormSource || resolvedGreenFormOwnerName) && (
          <div className="mt-3 space-y-1 w-full">
            {[
              ['Model', resolvedCarModel],
              ['Source', resolvedGreenFormSource],
              ['Employee', resolvedGreenFormOwnerName],
            ].filter(([, val]) => val).map(([label, val]) => (
              <div key={label} className="flex items-center gap-1.5 text-xs">
                <span className="text-gray-400 w-20 flex-shrink-0">{label}:</span>
                <span className="text-gray-700 font-medium">{val}</span>
              </div>
            ))}
          </div>
        )}

 {/* Response Log Button */}
 {isTemplateDrivenTab && sentCount > 0 && (
 <div className="mt-2.5 pt-2.5 border-t border-gray-100">
 <button
 onClick={() => setShowResponseLog(!showResponseLog)}
 className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-700 transition-colors"
 >
 <MessageSquare className="w-3.5 h-3.5" />
 Log customer response
 {showResponseLog ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
 </button>
 {showResponseLog && (
 <ResponseLogPanel
 lead={lead}
 tab={tab}
 onClose={() => setShowResponseLog(false)}
 />
 )}
 </div>
 )}
 </div>
 </div>
 );
}