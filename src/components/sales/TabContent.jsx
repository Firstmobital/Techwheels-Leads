import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Search, RefreshCw, Inbox, CheckSquare, Square, Send, X } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SelectItem } from "@/components/ui/select";
import MobileSelect from '@/components/shared/MobileSelect';
import { getSentMessageKeyForLead } from '@/utils/sentMessageUtils';
import { differenceInDays } from 'date-fns';
import { buildWhatsAppUrl } from '@/utils/phone';
import { cn } from '@/lib/utils';

import LeadCard from './LeadCard';

const UIInput = /** @type {any} */ (Input);
const UIButton = /** @type {any} */ (Button);
const UISelectItem = /** @type {any} */ (SelectItem);

// ─── helpers duplicated from LeadCard so TabContent is self-contained ──────────
const toInt = (v, fb) => { const p = Number.parseInt(String(v ?? '').trim(), 10); return Number.isFinite(p) ? p : fb; };

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
      const src = String(row?.lead_source || '').trim().toLowerCase();
      const rec = String(row?.source_record_id || '').trim();
      if (!src || !rec) return null;
      return `${src}:${rec}`;
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
  const days = tab === 'matchtalk' ? MATCHTALK : DEFAULT;
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
      const src = String(row?.lead_source || '').trim().toLowerCase();
      const rec = String(row?.source_record_id || '').trim();
      return (src && rec) ? `${src}:${rec}` : null;
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
  const days = tab === 'matchtalk' ? MATCHTALK : DEFAULT;
  if (sentCount >= days.length) return false;
  const nextDay = days[sentCount];
  if (nextDay === 1) return false;
  const daysSince = getDaysSinceFirstSent(history);
  return daysSince !== null && daysSince >= nextDay;
}

// ─── Bulk send panel ───────────────────────────────────────────────────────────
function BulkSendPanel({ selectedLeads, leads, tab, templates, sentMessages, onMarkSent, onClose }) {
  const [sending, setSending] = useState(false);
  const [sentIdx, setSentIdx] = useState(0);

  const CATEGORY_ALIASES = {
    vana: ['vana', 'vna'], matchtalk: ['matchtalk', 'match_stock', 'match'],
    greenforms: ['greenforms', 'green_forms', 'greenform'], ai_leads: ['ai_leads', 'ai-leads', 'ai'],
  };
  const toCanonical = (v) => {
    const t = String(v || '').trim().toLowerCase();
    if (!t || t === 'all' || t === 'general') return t;
    const e = Object.entries(CATEGORY_ALIASES).find(([, a]) => a.includes(t));
    return e ? e[0] : t;
  };

  const relevantTemplates = useMemo(() => {
    const safe = Array.isArray(templates) ? templates : [];
    return safe.filter(t => {
      if (t?.is_active === false) return false;
      const cat = toCanonical(t?.category || t?.source || '');
      return cat === tab || cat === 'all' || cat === 'general';
    });
  }, [templates, tab]);

  const firstTemplate = relevantTemplates.find(t => toInt(t?.step_number, 1) === 1) || relevantTemplates[0];

  const fillFor = (lead, tmpl) => {
    const name = lead?.customer_name || '';
    const ppl = lead?.ppl || lead?.car_model || lead?.model_name || '';
    const pl = lead?.pl || '';
    const ca = lead?.ca_name || lead?.employee_full_name || '';
    return (tmpl?.template_text || '')
      .replace(/{customer_name}/g, name).replace(/{name}/g, name)
      .replace(/{ppl}/g, ppl).replace(/{pl}/g, pl)
      .replace(/{ca_name}/g, ca).replace(/{car}/g, ppl || 'car');
  };

  const selectedLeadObjects = leads.filter(l => selectedLeads.has(l.id));

  const handleStartBulk = async () => {
    if (!firstTemplate || selectedLeadObjects.length === 0) return;
    setSending(true);
    for (let i = 0; i < selectedLeadObjects.length; i++) {
      const lead = selectedLeadObjects[i];
      const phone = lead?.phone_number || lead?.mobile_number || '';
      const msg = fillFor(lead, firstTemplate);
      const url = buildWhatsAppUrl(phone, msg);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        onMarkSent({ lead, leadType: tab, messageText: msg, templateId: firstTemplate?.id ?? null });
      }
      setSentIdx(i + 1);
      if (i < selectedLeadObjects.length - 1) {
        await new Promise(r => setTimeout(r, 800));
      }
    }
    setSending(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white dark:bg-gray-800 rounded-t-2xl w-full max-w-lg p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
            Bulk Send — {selectedLeads.size} leads selected
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {firstTemplate ? (
          <>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Template to send:</p>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3 text-xs text-gray-600 dark:text-gray-300 mb-4 max-h-28 overflow-y-auto whitespace-pre-wrap">
              {firstTemplate.template_text}
            </div>
            <p className="text-[11px] text-orange-600 dark:text-orange-400 mb-4">
              WhatsApp will open once per lead in sequence. Stay on this screen until done.
            </p>
            {sending && (
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Sending {sentIdx} of {selectedLeadObjects.length}…</span>
                  <span>{Math.round((sentIdx / selectedLeadObjects.length) * 100)}%</span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-600 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${(sentIdx / selectedLeadObjects.length) * 100}%` }}
                  />
                </div>
              </div>
            )}
            <button
              onClick={handleStartBulk}
              disabled={sending}
              className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              {sending ? `Sending (${sentIdx}/${selectedLeadObjects.length})…` : 'Start Bulk Send'}
            </button>
          </>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
            No active templates configured for this tab. Add templates in the Templates section first.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main TabContent ───────────────────────────────────────────────────────────
export default function TabContent({ leads, isLoading, tab, accentColor, getMessage, sentMessageKeys = new Set(), sentMessages = [], onMarkSent, onRefresh, templates, isAdmin, users = [] }) {
  const [search, setSearch] = useState('');
  const [carFilter, setCarFilter] = useState('all');
  const [showSent, setShowSent] = useState(false);
  const [personFilter, setPersonFilter] = useState('all');
  const [allocationFilter, setAllocationFilter] = useState('all');
  const [pplFilter, setPplFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [isPulling, setIsPulling] = useState(false);

  // Bulk send state
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState(new Set());
  const [showBulkPanel, setShowBulkPanel] = useState(false);

  const scrollRef = useRef(null);
  const startTouchRef = useRef(null);
  const scrollPositionsRef = useRef({});

  const carModels = useMemo(() => {
    const models = new Set();
    if (tab === 'matchtalk') {
      leads.forEach(l => l.ppl && models.add(l.ppl));
    } else if (tab === 'vana') {
      leads.forEach(l => { const m = l.car_model || l.ppl; m && models.add(m); });
    } else if (tab === 'greenforms') {
      leads.forEach(l => { const m = l.model_name || l.car_model || l.ppl; m && models.add(m); });
    } else {
      leads.forEach(l => l.car_model && models.add(l.car_model));
    }
    return [...models].sort();
  }, [leads, tab]);

  const pplOptions = useMemo(() => {
    if (tab !== 'greenforms') return [];
    const vals = new Set();
    leads.forEach(l => { const m = l.model_name || l.car_model || l.ppl; m && vals.add(m); });
    return [...vals].sort();
  }, [leads, tab]);

  const sourceOptions = useMemo(() => {
    if (tab !== 'greenforms') return [];
    const vals = new Set();
    leads.forEach(l => { const s = l.source_type || l.source_pv; s && vals.add(s); });
    return [...vals].sort();
  }, [leads, tab]);

  const branchOptions = useMemo(() => {
    if (tab === 'greenforms') return [];
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
      const resolvedPhone = lead.mobile_number || lead.phone_number || '';
      const resolvedProductLine = lead.product_line || '';
      const resolvedSalesTeam = lead.sales_team || '';
      const resolvedChassisNo = lead.chassis_no || '';
      const normalizedSearch = search.toLowerCase();
      const resolvedVnaModel = lead.car_model || lead.ppl || '';
      const resolvedVnaAllocation = String(lead.allocation_status || lead.status || '').trim().toLowerCase();
      const resolvedGreenFormModel = lead.model_name || lead.car_model || lead.ppl;
      const resolvedGreenFormSource = lead.source_type || lead.source_pv || '';

      const matchSearch = !search ||
        lead.customer_name?.toLowerCase().includes(normalizedSearch) ||
        String(resolvedPhone).includes(search) ||
        String(resolvedChassisNo).toLowerCase().includes(normalizedSearch) ||
        String(resolvedProductLine).toLowerCase().includes(normalizedSearch) ||
        String(resolvedSalesTeam).toLowerCase().includes(normalizedSearch);

      const matchCar = carFilter === 'all' || (tab === 'matchtalk'
        ? (lead.product_line ? lead.product_line === carFilter : lead.ppl === carFilter)
        : tab === 'vana'
          ? (lead.product_line ? lead.product_line === carFilter : resolvedVnaModel === carFilter)
        : tab === 'greenforms'
          ? resolvedGreenFormModel === carFilter
          : lead.car_model === carFilter);

      const leadSentKey = getSentMessageKeyForLead(lead, tab);
      const isLeadSent = leadSentKey ? sentMessageKeys.has(leadSentKey) : false;
      const matchSent = showSent || !isLeadSent;

      const matchPerson = personFilter === 'all' || (tab === 'greenforms' ? lead.salesperson_id === personFilter : lead.ca_name === personFilter);
      const matchAllocation = allocationFilter === 'all' || (tab === 'vana' && resolvedVnaAllocation === 'next in allocation');
      const matchPpl = pplFilter === 'all' || resolvedGreenFormModel === pplFilter;
      const matchSource = sourceFilter === 'all' || resolvedGreenFormSource === sourceFilter;
      const matchBranch = branchFilter === 'all' || lead.branch === branchFilter;

      return matchSearch && matchCar && matchSent && matchPerson && matchAllocation && matchPpl && matchSource && matchBranch;
    });
  }, [leads, search, carFilter, showSent, sentMessageKeys, personFilter, allocationFilter, pplFilter, sourceFilter, branchFilter, tab]);

  // ── Summary counts ────────────────────────────────────────────────────────
  const summaryCounts = useMemo(() => {
    const isTemplateDriven = tab === 'vana' || tab === 'matchtalk' || tab === 'greenforms';
    if (!isTemplateDriven) return null;
    let total = filtered.length;
    let overdue = 0;
    let dueToday = 0;
    let done = 0;
    filtered.forEach(lead => {
      const key = getSentMessageKeyForLead(lead, tab);
      const history = sentMessages.filter(row => {
        const rowKey = (() => {
          const src = String(row?.lead_source || '').trim().toLowerCase();
          const rec = String(row?.source_record_id || '').trim();
          return (src && rec) ? `${src}:${rec}` : null;
        })();
        return key && rowKey && key === rowKey;
      });

      const seqTemplates = Array.isArray(templates) ? templates
        .filter(t => t?.step_number != null)
        .map((t, i) => ({ ...t, step_number: Math.max(1, toInt(t.step_number, i + 1)), delay_days: Math.max(0, toInt(t.delay_days, 0)) }))
        .sort((a, b) => a.step_number - b.step_number) : [];
      const hasConfigured = seqTemplates.some(t => t.step_number > 1 || t.delay_days > 0);
      const totalSeqSteps = hasConfigured ? seqTemplates.length : (tab === 'matchtalk' ? 3 : 3);
      const sentCount = history.length;

      if (sentCount >= totalSeqSteps) { done++; return; }
      if (isOverdue(lead, tab, sentMessages, templates)) { overdue++; return; }
      if (isDueToday(lead, tab, sentMessages, templates)) { dueToday++; return; }
    });
    const pending = total - done - overdue - dueToday;
    return { total, overdue, dueToday, done, pending };
  }, [filtered, tab, sentMessages, templates]);

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

  const toggleBulkMode = () => {
    setBulkMode(b => !b);
    setSelectedLeads(new Set());
  };

  const toggleLeadSelection = (leadId) => {
    setSelectedLeads(prev => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId); else next.add(leadId);
      return next;
    });
  };

  const selectAll = () => setSelectedLeads(new Set(filtered.map(l => l.id)));
  const clearAll = () => setSelectedLeads(new Set());

  const isTemplateDriven = tab === 'vana' || tab === 'matchtalk' || tab === 'greenforms';

  return (
    <div className="flex flex-col h-full dark:bg-gray-900">
      {/* ── Summary bar ── */}
      {summaryCounts && !isLoading && (
        <div className="grid grid-cols-4 gap-2 px-4 pt-3 pb-1">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-2 text-center border border-gray-100 dark:border-gray-700">
            <div className="text-sm font-semibold text-gray-900 dark:text-white">{summaryCounts.total}</div>
            <div className="text-[10px] text-gray-400">Total</div>
          </div>
          <div className={cn("rounded-xl p-2 text-center border", summaryCounts.overdue > 0 ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" : "bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700")}>
            <div className={cn("text-sm font-semibold", summaryCounts.overdue > 0 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white")}>{summaryCounts.overdue}</div>
            <div className="text-[10px] text-gray-400">Overdue</div>
          </div>
          <div className={cn("rounded-xl p-2 text-center border", summaryCounts.dueToday > 0 ? "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800" : "bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700")}>
            <div className={cn("text-sm font-semibold", summaryCounts.dueToday > 0 ? "text-orange-600 dark:text-orange-400" : "text-gray-900 dark:text-white")}>{summaryCounts.dueToday}</div>
            <div className="text-[10px] text-gray-400">Due Today</div>
          </div>
          <div className={cn("rounded-xl p-2 text-center border", summaryCounts.done > 0 ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800" : "bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700")}>
            <div className={cn("text-sm font-semibold", summaryCounts.done > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-gray-900 dark:text-white")}>{summaryCounts.done}</div>
            <div className="text-[10px] text-gray-400">Done</div>
          </div>
        </div>
      )}

      {/* ── Search & Filters ── */}
      <div className="px-4 pt-2 pb-2 space-y-2 bg-gray-50/80 dark:bg-gray-800/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <UIInput
              placeholder="Search name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-xl bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-sm dark:text-white"
            />
          </div>
          <UIButton
            variant="outline"
            size="icon"
            onClick={onRefresh}
            disabled={isLoading}
            className="h-10 w-10 rounded-xl border-gray-200 dark:border-gray-600"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </UIButton>
          {/* Bulk mode toggle — only for template-driven tabs */}
          {isTemplateDriven && (
            <UIButton
              variant={bulkMode ? "default" : "outline"}
              size="icon"
              onClick={toggleBulkMode}
              className={cn("h-10 w-10 rounded-xl", bulkMode ? "bg-gray-900 dark:bg-gray-100 dark:text-gray-900 text-white" : "border-gray-200 dark:border-gray-600")}
              title="Bulk send mode"
            >
              <CheckSquare className="w-4 h-4" />
            </UIButton>
          )}
        </div>

        {/* Bulk select toolbar */}
        {bulkMode && (
          <div className="flex items-center justify-between bg-gray-900 dark:bg-gray-700 rounded-xl px-3 py-2">
            <div className="flex items-center gap-2">
              <button onClick={selectAll} className="text-[11px] text-white/70 hover:text-white">Select all</button>
              <span className="text-white/30">·</span>
              <button onClick={clearAll} className="text-[11px] text-white/70 hover:text-white">Clear</button>
              <span className="text-[11px] text-white font-semibold">{selectedLeads.size} selected</span>
            </div>
            <button
              onClick={() => selectedLeads.size > 0 && setShowBulkPanel(true)}
              disabled={selectedLeads.size === 0}
              className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 disabled:opacity-40 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg"
            >
              <Send className="w-3.5 h-3.5" />
              Send ({selectedLeads.size})
            </button>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          {carModels.length > 0 && (
            <MobileSelect value={carFilter} onValueChange={setCarFilter} placeholder={tab === 'matchtalk' ? 'PPL' : 'Models'} className="flex-1">
              <UISelectItem value="all">{tab === 'matchtalk' ? 'All PPL' : 'All'}</UISelectItem>
              {carModels.map(m => <UISelectItem key={m} value={m}>{m}</UISelectItem>)}
            </MobileSelect>
          )}
          {isAdmin && caOptions.length > 0 && (tab === 'matchtalk' || tab === 'vana') && (
            <MobileSelect value={personFilter} onValueChange={setPersonFilter} placeholder="CA Name" className="flex-1">
              <UISelectItem value="all">All CA Name</UISelectItem>
              {caOptions.map(ca => <UISelectItem key={ca} value={ca}>{ca}</UISelectItem>)}
            </MobileSelect>
          )}
          {tab === 'greenforms' && pplOptions.length > 0 && (
            <MobileSelect value={pplFilter} onValueChange={setPplFilter} placeholder="PPL" className="flex-1">
              <UISelectItem value="all">All PPL</UISelectItem>
              {pplOptions.map(p => <UISelectItem key={p} value={p}>{p}</UISelectItem>)}
            </MobileSelect>
          )}
          {tab === 'greenforms' && sourceOptions.length > 0 && (
            <MobileSelect value={sourceFilter} onValueChange={setSourceFilter} placeholder="Source" className="flex-1">
              <UISelectItem value="all">All Source</UISelectItem>
              {sourceOptions.map(s => <UISelectItem key={s} value={s}>{s}</UISelectItem>)}
            </MobileSelect>
          )}
          {tab !== 'greenforms' && branchOptions.length > 0 && (
            <MobileSelect value={branchFilter} onValueChange={setBranchFilter} placeholder="Branch" className="flex-1">
              <UISelectItem value="all">All Branch</UISelectItem>
              {branchOptions.map(b => <UISelectItem key={b} value={b}>{b}</UISelectItem>)}
            </MobileSelect>
          )}
          {tab === 'vana' && (
            <UIButton
              variant={allocationFilter === 'Next In Allocation' ? "default" : "outline"}
              size="sm"
              onClick={() => setAllocationFilter(allocationFilter === 'Next In Allocation' ? 'all' : 'Next In Allocation')}
              className="h-8 rounded-lg text-xs px-3"
            >
              Next In Allocation
            </UIButton>
          )}
          <UIButton
            variant={showSent ? "default" : "outline"}
            size="sm"
            onClick={() => setShowSent(!showSent)}
            className="h-8 rounded-lg text-xs px-3"
          >
            {showSent ? 'Hide sent' : 'Show sent'}
          </UIButton>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-gray-400 font-medium">
            {filtered.length} lead{filtered.length !== 1 ? 's' : ''}
            {sentMessageKeys.size > 0 && ` · ${sentMessageKeys.size} sent`}
          </div>
        </div>
      </div>

      {/* ── Lead list ── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 pb-24 pt-2 dark:bg-gray-900"
        onTouchStart={(e) => { startTouchRef.current = e.touches?.[0]?.clientY || null; }}
        onTouchMove={handlePullToRefresh}
        onTouchEnd={() => { startTouchRef.current = null; }}
      >
        {isPulling && (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 dark:border-gray-600 border-t-gray-900 dark:border-t-white" />
          </div>
        )}
        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 animate-pulse">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32" />
                    <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-24" />
                    <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-28" />
                  </div>
                  <div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
            <Inbox className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">No leads found</p>
            <p className="text-xs mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(lead => {
              const leadKey = getSentMessageKeyForLead(lead, tab);
              const isLeadSent = Boolean(leadKey && sentMessageKeys.has(leadKey));
              const isSelected = selectedLeads.has(lead.id);
              return (
                <div key={lead.id} className="relative">
                  {/* Bulk select checkbox overlay */}
                  {bulkMode && (
                    <button
                      onClick={() => toggleLeadSelection(lead.id)}
                      className={cn(
                        "absolute left-0 top-0 bottom-0 w-10 z-10 flex items-center justify-center rounded-l-2xl transition-colors",
                        isSelected ? "bg-gray-900 dark:bg-gray-100" : "bg-gray-100 dark:bg-gray-700"
                      )}
                    >
                      {isSelected
                        ? <CheckSquare className="w-4 h-4 text-white dark:text-gray-900" />
                        : <Square className="w-4 h-4 text-gray-400" />
                      }
                    </button>
                  )}
                  <div className={cn(bulkMode && "pl-10")}>
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
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bulk send modal */}
      {showBulkPanel && (
        <BulkSendPanel
          selectedLeads={selectedLeads}
          leads={filtered}
          tab={tab}
          templates={templates}
          sentMessages={sentMessages}
          onMarkSent={onMarkSent}
          onClose={() => { setShowBulkPanel(false); setBulkMode(false); setSelectedLeads(new Set()); }}
        />
      )}
    </div>
  );
}
