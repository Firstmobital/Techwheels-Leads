// @ts-nocheck
import React, { useState, useMemo, useRef, useEffect, useCallback } from'react';
import { Search, RefreshCw, Inbox } from'lucide-react';
import { Input } from"@/components/ui/input";
import { Button } from"@/components/ui/button";
import { SelectItem } from"@/components/ui/select";
import MobileSelect from'@/components/shared/MobileSelect';
import { getSentMessageKeyForLead } from'@/utils/sentMessageUtils';
import { differenceInDays } from'date-fns';
import { cn } from'@/lib/utils';

import LeadCard from'./LeadCard';

const UIInput = /** @type {any} */ (Input);
const UIButton = /** @type {any} */ (Button);
const UISelectItem = /** @type {any} */ (SelectItem);

// ─── helpers duplicated from LeadCard so TabContent is self-contained ──────────
const toInt = (v, fb) => { const p = Number.parseInt(String(v ??'').trim(), 10); return Number.isFinite(p) ? p : fb; };

function getDaysSinceFirstSent(history) {
 if (!history?.length) return null;
 const first = [...history].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
 if (!first?.created_at) return null;
 return differenceInDays(new Date(), new Date(first.created_at));
}

function isOverdue(lead, tab, sentMessages, templates) {
 const history = sentMessages.filter(row => {
 const key = getSentMessageKeyForLead(lead, tab);
 const rowKey = (() => {
 const src = String(row?.lead_source ||'').trim().toLowerCase();
 const rec = String(row?.source_record_id ||'').trim();
 if (!src || !rec) return null;
 return`${src}:${rec}`;
 })();
 return key && rowKey && key === rowKey;
 });
 if (!history.length) return false;
 const seqTemplates = Array.isArray(templates) ? templates
 .filter(t => t?.step_number != null)
 .map((t, i) => ({ ...t, step_number: Math.max(1, toInt(t.step_number, i + 1)), delay_days: Math.max(0, toInt(t.delay_days, 0)) }))
 .sort((a, b) => a.step_number - b.step_number)
 : [];
 const hasConfigured = seqTemplates.some(t => t.step_number > 1 || t.delay_days > 0);
 const seq = hasConfigured ? seqTemplates : [];

 const sentCount = history.length;
 if (seq.length > 0) {
 if (sentCount >= seq.length) return false;
 const nextDelay = Math.max(0, toInt(seq[sentCount]?.delay_days, 0));
 const daysSince = getDaysSinceFirstSent(history);
 return daysSince !== null && daysSince > nextDelay;
 }
 const MATCHTALK = [1, 2, 4];
 const DEFAULT = [1, 2, 5];
 const days = tab ==='matchtalk' ? MATCHTALK : DEFAULT;
 if (sentCount >= days.length) return false;
 const nextDay = days[sentCount];
 if (nextDay === 1) return false;
 const daysSince = getDaysSinceFirstSent(history);
 return daysSince !== null && daysSince > nextDay;
}

function isDueToday(lead, tab, sentMessages, templates) {
 const key = getSentMessageKeyForLead(lead, tab);
 const history = sentMessages.filter(row => {
 const rowKey = (() => {
 const src = String(row?.lead_source ||'').trim().toLowerCase();
 const rec = String(row?.source_record_id ||'').trim();
 return (src && rec) ?`${src}:${rec}` : null;
 })();
 return key && rowKey && key === rowKey;
 });
 // 0 sent → first message is always due
 if (!history.length) return true;

 const seqTemplates = Array.isArray(templates) ? templates
 .filter(t => t?.step_number != null)
 .map((t, i) => ({ ...t, step_number: Math.max(1, toInt(t.step_number, i + 1)), delay_days: Math.max(0, toInt(t.delay_days, 0)) }))
}

function hasCustomFollowupDue(lead, tab, followupCalls) {
 const leadKey = getSentMessageKeyForLead(lead, tab);
 if (!leadKey) return { due: false, overdue: false };
 const calls = followupCalls.filter(c => {
 const src = String(c.lead_source || '').trim().toLowerCase();
 const rec = String(c.source_record_id || '').trim();
 return `${src}:${rec}` === leadKey;
 });
 if (!calls.length) return { due: false, overdue: false };
 const latest = calls.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
 if (!latest.next_call_date) return { due: false, overdue: false };
 const today = new Date(); today.setHours(0,0,0,0);
 const due = new Date(latest.next_call_date); due.setHours(0,0,0,0);
 if (due.getTime() === today.getTime()) return { due: true, overdue: false };
 if (due.getTime() < today.getTime()) return { due: false, overdue: true };
 return { due: false, overdue: false };
}

function isDueToday(lead, tab, sentMessages, templates) {
 const key = getSentMessageKeyForLead(lead, tab);
 const history = sentMessages.filter(row => {
 const rowKey = (() => {
 const src = String(row?.lead_source ||'').trim().toLowerCase();
 const rec = String(row?.source_record_id ||'').trim();
 return (src && rec) ?`${src}:${rec}` : null;
 })();
 return key && rowKey && key === rowKey;
 });
 // 0 sent → first message is always due
 if (!history.length) return true;

 const seqTemplates = Array.isArray(templates) ? templates
 .filter(t => t?.step_number != null)
 .map((t, i) => ({ ...t, step_number: Math.max(1, toInt(t.step_number, i + 1)), delay_days: Math.max(0, toInt(t.delay_days, 0)) }))
 .sort((a, b) => a.step_number - b.step_number) : [];
 const hasConfigured = seqTemplates.some(t => t.step_number > 1 || t.delay_days > 0);
 const seq = hasConfigured ? seqTemplates : [];

 const sentCount = history.length;
 if (seq.length > 0) {
 if (sentCount >= seq.length) return false;
 const nextDelay = Math.max(0, toInt(seq[sentCount]?.delay_days, 0));
 const daysSince = getDaysSinceFirstSent(history);
 return daysSince !== null && daysSince >= nextDelay;
 }
 const MATCHTALK = [1, 2, 4];
 const DEFAULT = [1, 2, 5];
 const days = tab ==='matchtalk' ? MATCHTALK : DEFAULT;
 if (sentCount >= days.length) return false;
 const nextDay = days[sentCount];
 if (nextDay === 1) return false;
 const daysSince = getDaysSinceFirstSent(history);
 return daysSince !== null && daysSince >= nextDay;
}

// ─── Main TabContent ───────────────────────────────────────────────────────────
export default function TabContent({ leads, isLoading, tab, accentColor, getMessage, sentMessageKeys = new Set(), sentMessages = [], onMarkSent, onRefresh, templates, isAdmin, users = [], followupCalls = [] }) {
 const [search, setSearch] = useState('');
 const [carFilter, setCarFilter] = useState('all');
 const [subTab, setSubTab] = useState('pending');
 const [showSent, setShowSent] = useState(false);
 const [personFilter, setPersonFilter] = useState('all');
 const [allocationFilter, setAllocationFilter] = useState('all');
 const [pplFilter, setPplFilter] = useState('all');
 const [sourceFilter, setSourceFilter] = useState('all');
 const [branchFilter, setBranchFilter] = useState('all');
 const [isPulling, setIsPulling] = useState(false);

 const scrollRef = useRef(null);
 const startTouchRef = useRef(null);
 const scrollPositionsRef = useRef({});

 const carModels = useMemo(() => {
 const models = new Set();
 if (tab ==='matchtalk') {
 leads.forEach(l => l.ppl && models.add(l.ppl));
 } else if (tab ==='vana') {
 leads.forEach(l => { const m = l.car_model || l.ppl; m && models.add(m); });
 } else if (tab ==='greenforms') {
 leads.forEach(l => { const m = l.model_name || l.car_model || l.ppl; m && models.add(m); });
 } else {
 leads.forEach(l => l.car_model && models.add(l.car_model));
 }
 return [...models].sort();
 }, [leads, tab]);

 const pplOptions = useMemo(() => {
 if (tab !=='greenforms') return [];
 const vals = new Set();
 leads.forEach(l => { const m = l.model_name || l.car_model || l.ppl; m && vals.add(m); });
 return [...vals].sort();
 }, [leads, tab]);

 const sourceOptions = useMemo(() => {
 if (tab !=='greenforms') return [];
 const vals = new Set();
 leads.forEach(l => { const s = l.source_type || l.source_pv; s && vals.add(s); });
 return [...vals].sort();
 }, [leads, tab]);

 const branchOptions = useMemo(() => {
 if (tab ==='greenforms') return [];
 const vals = new Set();
 leads.forEach(l => l.branch && vals.add(l.branch));
 return [...vals].sort();
 }, [leads, tab]);

 const caOptions = useMemo(() => {
 const vals = new Set();
 leads.forEach(l => l.ca_name && vals.add(l.ca_name));
 return [...vals].sort();
 }, [leads]);

 const filtered = useMemo(() => {
 return leads.filter(lead => {
 const resolvedPhone = lead.mobile_number || lead.phone_number ||'';
 const resolvedProductLine = lead.product_line ||'';
 const resolvedSalesTeam = lead.sales_team ||'';
 const resolvedChassisNo = lead.chassis_no ||'';
 const normalizedSearch = search.toLowerCase();
 const resolvedVnaModel = lead.car_model || lead.ppl ||'';
 const resolvedVnaAllocation = String(lead.allocation_status || lead.status ||'').trim().toLowerCase();
 const resolvedGreenFormModel = lead.model_name || lead.car_model || lead.ppl;
 const resolvedGreenFormSource = lead.source_type || lead.source_pv ||'';

 const matchSearch = !search ||
 lead.customer_name?.toLowerCase().includes(normalizedSearch) ||
 String(resolvedPhone).includes(search) ||
 String(resolvedChassisNo).toLowerCase().includes(normalizedSearch) ||
 String(resolvedProductLine).toLowerCase().includes(normalizedSearch) ||
 String(resolvedSalesTeam).toLowerCase().includes(normalizedSearch);

 const matchCar = carFilter ==='all' || (tab ==='matchtalk'
 ? (lead.product_line ? lead.product_line === carFilter : lead.ppl === carFilter)
 : tab ==='vana'
 ? (lead.product_line ? lead.product_line === carFilter : resolvedVnaModel === carFilter)
 : tab ==='greenforms'
 ? resolvedGreenFormModel === carFilter
 : lead.car_model === carFilter);

 const leadSentKey = getSentMessageKeyForLead(lead, tab);
 const isLeadSent = leadSentKey ? sentMessageKeys.has(leadSentKey) : false;
 const matchSent = showSent || !isLeadSent;

 const matchPerson = personFilter ==='all' || (tab ==='greenforms' ? lead.salesperson_id === personFilter : lead.ca_name === personFilter);
 const matchAllocation = allocationFilter ==='all' || (tab ==='vana' && resolvedVnaAllocation ==='next in allocation');
 const matchPpl = pplFilter ==='all' || resolvedGreenFormModel === pplFilter;
 const matchSource = sourceFilter ==='all' || resolvedGreenFormSource === sourceFilter;
 const matchBranch = branchFilter ==='all' || lead.branch === branchFilter;

 return matchSearch && matchCar && matchSent && matchPerson && matchAllocation && matchPpl && matchSource && matchBranch;
 });
 }, [leads, search, carFilter, showSent, sentMessageKeys, personFilter, allocationFilter, pplFilter, sourceFilter, branchFilter, tab]);

 // ── Summary counts ────────────────────────────────────────────────────────
 const summaryCounts = useMemo(() => {
 const isTemplateDriven = tab ==='vana' || tab ==='matchtalk' || tab ==='greenforms';
 if (!isTemplateDriven) return null;
 let total = filtered.length;
 let overdue = 0;
 let dueToday = 0;
 let done = 0;
 filtered.forEach(lead => {
 const key = getSentMessageKeyForLead(lead, tab);
 const history = sentMessages.filter(row => {
 const rowKey = (() => {
 const src = String(row?.lead_source ||'').trim().toLowerCase();
 const rec = String(row?.source_record_id ||'').trim();
 return (src && rec) ?`${src}:${rec}` : null;
 })();
 return key && rowKey && key === rowKey;
 });

 const seqTemplates = Array.isArray(templates) ? templates
 .filter(t => t?.step_number != null)
 .map((t, i) => ({ ...t, step_number: Math.max(1, toInt(t.step_number, i + 1)), delay_days: Math.max(0, toInt(t.delay_days, 0)) }))
 .sort((a, b) => a.step_number - b.step_number) : [];
 const hasConfigured = seqTemplates.some(t => t.step_number > 1 || t.delay_days > 0);
 const totalSeqSteps = hasConfigured ? seqTemplates.length : (tab ==='matchtalk' ? 3 : 3);
 const sentCount = history.length;

 if (sentCount >= totalSeqSteps) { done++; return; }
 if (isOverdue(lead, tab, sentMessages, templates)) { overdue++; return; }
 if (isDueToday(lead, tab, sentMessages, templates)) { dueToday++; return; }
 });
 const pending = total - done - overdue - dueToday;
 return { total, overdue, dueToday, done, pending };
 }, [filtered, tab, sentMessages, templates]);

 const { pendingLeads, allLeads } = useMemo(() => {
 const pending = [];
 filtered.forEach(lead => {
 const autoSeqDue = isDueToday(lead, tab, sentMessages, templates);
 const autoSeqOverdue = isOverdue(lead, tab, sentMessages, templates);
 const custom = hasCustomFollowupDue(lead, tab, followupCalls);
 const isPending = autoSeqDue || autoSeqOverdue || custom.due || custom.overdue;
 if (isPending) pending.push({
 lead,
 autoSeqOverdue,
 customOverdue: custom.overdue,
 customDue: custom.due,
 });
 });
 pending.sort((a, b) => {
 const scoreA = (a.autoSeqOverdue || a.customOverdue ? 2 : 0) + (a.customDue ? 1 : 0);
 const scoreB = (b.autoSeqOverdue || b.customOverdue ? 2 : 0) + (b.customDue ? 1 : 0);
 return scoreB - scoreA;
 });
 return { pendingLeads: pending, allLeads: filtered };
 }, [filtered, tab, sentMessages, templates, followupCalls]);

 // Save/restore scroll
 useEffect(() => {
 return () => {
 if (scrollRef.current) scrollPositionsRef.current[tab] = scrollRef.current.scrollTop;
 };
 }, [tab]);
 useEffect(() => {
 if (scrollRef.current && scrollPositionsRef.current[tab]) {
 scrollRef.current.scrollTop = scrollPositionsRef.current[tab];
 }
 }, [tab]);

 const handlePullToRefresh = (e) => {
 if (scrollRef.current.scrollTop === 0 && startTouchRef.current !== null) {
 const currentY = e.touches?.[0]?.clientY || 0;
 const diff = currentY - startTouchRef.current;
 if (diff > 60) {
 setIsPulling(true);
 onRefresh();
 setTimeout(() => setIsPulling(false), 1000);
 startTouchRef.current = null;
 }
 }
 };

 const isTemplateDriven = tab ==='vana' || tab ==='matchtalk' || tab ==='greenforms';

 return (
 <div className="flex flex-col h-full">

 {/* ── Search & Filters ── */}
 <div className="px-4 pt-2 pb-2 space-y-2 bg-gray-50/80 backdrop-blur-sm sticky top-0 z-10">
 <div className="flex gap-2">
 <div className="relative flex-1">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
 <UIInput
 placeholder="Search name or phone..."
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 className="pl-9 h-10 rounded-xl bg-white border-gray-200 text-sm"
 />
 </div>
 <UIButton
 variant="outline"
 size="icon"
 onClick={onRefresh}
 disabled={isLoading}
 className="h-10 w-10 rounded-xl border-gray-200"
 >
 <RefreshCw className={`w-4 h-4 ${isLoading ?'animate-spin' :''}`} />
 </UIButton>
 </div>

 <div className="flex gap-2 flex-wrap">
 {carModels.length > 0 && (
 <MobileSelect value={carFilter} onValueChange={setCarFilter} placeholder={tab ==='matchtalk' ?'PPL' :'Models'} className="flex-1">
 <UISelectItem value="all">{tab ==='matchtalk' ?'All PPL' :'All'}</UISelectItem>
 {carModels.map(m => <UISelectItem key={m} value={m}>{m}</UISelectItem>)}
 </MobileSelect>
 )}
 {isAdmin && caOptions.length > 0 && (tab ==='matchtalk' || tab ==='vana') && (
 <MobileSelect value={personFilter} onValueChange={setPersonFilter} placeholder="CA Name" className="flex-1">
 <UISelectItem value="all">All CA Name</UISelectItem>
 {caOptions.map(ca => <UISelectItem key={ca} value={ca}>{ca}</UISelectItem>)}
 </MobileSelect>
 )}
 {tab ==='greenforms' && pplOptions.length > 0 && (
 <MobileSelect value={pplFilter} onValueChange={setPplFilter} placeholder="PPL" className="flex-1">
 <UISelectItem value="all">All PPL</UISelectItem>
 {pplOptions.map(p => <UISelectItem key={p} value={p}>{p}</UISelectItem>)}
 </MobileSelect>
 )}
 {tab ==='greenforms' && sourceOptions.length > 0 && (
 <MobileSelect value={sourceFilter} onValueChange={setSourceFilter} placeholder="Source" className="flex-1">
 <UISelectItem value="all">All Source</UISelectItem>
 {sourceOptions.map(s => <UISelectItem key={s} value={s}>{s}</UISelectItem>)}
 </MobileSelect>
 )}
 {tab !=='greenforms' && branchOptions.length > 0 && (
 <MobileSelect value={branchFilter} onValueChange={setBranchFilter} placeholder="Branch" className="flex-1">
 <UISelectItem value="all">All Branch</UISelectItem>
 {branchOptions.map(b => <UISelectItem key={b} value={b}>{b}</UISelectItem>)}
 </MobileSelect>
 )}
 {tab ==='vana' && (
 <UIButton
 variant={allocationFilter ==='Next In Allocation' ?"default" :"outline"}
 size="sm"
 onClick={() => setAllocationFilter(allocationFilter ==='Next In Allocation' ?'all' :'Next In Allocation')}
 className="h-8 rounded-lg text-xs px-3"
 >
 Next In Allocation
 </UIButton>
 )}
 <UIButton
 variant={showSent ?"default" :"outline"}
 size="sm"
 onClick={() => setShowSent(!showSent)}
 className="h-8 rounded-lg text-xs px-3"
 >
 {showSent ?'Hide sent' :'Show sent'}
 </UIButton>
 </div>
 <div className="flex items-center justify-between">
 <div className="text-[11px] text-gray-400 font-medium">
 {filtered.length} lead{filtered.length !== 1 ?'s' :''}
 {sentMessageKeys.size > 0 &&` · ${sentMessageKeys.size} sent`}
 </div>
 </div>
 </div>

 {/* ── Stats pills ── */}
 <div className="flex gap-1 px-4 py-2">
 <button
 type="button"
 onClick={() => setSubTab('pending')}
 className={cn(
 'flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-all',
 subTab === 'pending' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
 )}
 >
 Pending Today {pendingLeads.length > 0 ? `(${pendingLeads.length})` : ''}
 </button>
 <button
 type="button"
 onClick={() => setSubTab('all')}
 className={cn(
 'flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-all',
 subTab === 'all' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
 )}
 >
 All Leads ({allLeads.length})
 </button>
 </div>

 {/* ── Lead list ── */}
 <div
 ref={scrollRef}
 className="flex-1 overflow-y-auto md:overflow-visible px-4 pb-24 md:pb-8 pt-2"
 onTouchStart={(e) => { startTouchRef.current = e.touches?.[0]?.clientY || null; }}
 onTouchMove={handlePullToRefresh}
 onTouchEnd={() => { startTouchRef.current = null; }}
 >
 {isPulling && (
 <div className="flex justify-center py-4">
 <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-gray-900" />
 </div>
 )}
 {isLoading ? (
 <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
 {[1,2,3,4].map(i => (
 <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 animate-pulse">
 <div className="flex items-start justify-between gap-3">
 <div className="flex-1 space-y-2">
 <div className="h-4 bg-gray-200 rounded w-32" />
 <div className="h-3 bg-gray-100 rounded w-24" />
 <div className="h-3 bg-gray-100 rounded w-28" />
 </div>
 <div className="h-12 w-12 bg-gray-200 rounded-xl" />
 </div>
 </div>
 ))}
 </div>
 ) : filtered.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-16 text-gray-400">
 <Inbox className="w-10 h-10 mb-3" />
 <p className="text-sm font-medium">No leads found</p>
 <p className="text-xs mt-1">Try adjusting your filters</p>
 </div>
 ) : (
 <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
 {(subTab === 'pending' ? pendingLeads.map(p => p.lead) : allLeads).map(lead => {
 const leadKey = getSentMessageKeyForLead(lead, tab);
 const isLeadSent = Boolean(leadKey && sentMessageKeys.has(leadKey));
 return (
 <div key={lead.id} className="relative">
 <LeadCard
 lead={lead}
 tab={tab}
 accentColor={accentColor}
 message={getMessage(lead)}
 isSent={isLeadSent}
 sentMessages={sentMessages}
 onMarkSent={onMarkSent}
 templates={templates}
 />
 </div>
 );
 })}
 </div>
 )}
 </div>
 </div>
 );
}