// @ts-nocheck
import React, { useMemo, useState } from 'react';
import { supabaseApi } from '@/api/supabaseService';
import { supabase } from '@/api/supabaseClient';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/CurrentUserContext';
import { isAdminUser } from '@/lib/authUserUtils';
import { differenceInDays, format, parseISO, isBefore, startOfDay } from 'date-fns';
import { Bell, CheckCircle2, Clock, AlertTriangle, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSentMessageKeyForLead } from '@/utils/sentMessageUtils';

const toInt = (v, fb) => { const p = Number.parseInt(String(v ?? '').trim(), 10); return Number.isFinite(p) ? p : fb; };

function getDaysSinceFirstSent(history) {
  if (!history?.length) return null;
  const first = [...history].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
  if (!first?.created_at) return null;
  return differenceInDays(new Date(), new Date(first.created_at));
}

function getLeadStatus(lead, tab, sentMessages, templates) {
  const key = getSentMessageKeyForLead(lead, tab);
  const history = sentMessages.filter(row => {
    const src = String(row?.lead_source || '').trim().toLowerCase();
    const rec = String(row?.source_record_id || '').trim();
    const rowKey = (src && rec) ? `${src}:${rec}` : null;
    return key && rowKey && key === rowKey;
  });

  const seqTemplates = Array.isArray(templates)
    ? templates
        .filter(t => t?.step_number != null)
        .map((t, i) => ({ ...t, step_number: Math.max(1, toInt(t.step_number, i + 1)), delay_days: Math.max(0, toInt(t.delay_days, 0)) }))
        .sort((a, b) => a.step_number - b.step_number)
    : [];
  const hasConfigured = seqTemplates.some(t => t.step_number > 1 || t.delay_days > 0);
  const seq = hasConfigured ? seqTemplates : [];
  const MATCHTALK = [1, 2, 4];
  const DEFAULT = [1, 2, 5];
  const legacyDays = tab === 'matchtalk' ? MATCHTALK : DEFAULT;
  const totalSteps = seq.length > 0 ? seq.length : legacyDays.length;
  const sentCount = history.length;

  if (sentCount >= totalSteps) return { status: 'done', nextStep: null, daysUntil: null, overdue: false, sentCount, totalSteps };

  if (sentCount === 0) {
    return { status: 'pending', nextStep: 1, daysUntil: 0, overdue: false, sentCount, totalSteps };
  }

  const daysSince = getDaysSinceFirstSent(history);

  if (seq.length > 0) {
    const nextDelay = Math.max(0, toInt(seq[sentCount]?.delay_days, 0));
    const overdue = daysSince !== null && daysSince > nextDelay;
    const dueNow = daysSince !== null && daysSince >= nextDelay;
    return {
      status: overdue ? 'overdue' : dueNow ? 'due' : 'scheduled',
      nextStep: sentCount + 1,
      daysUntil: dueNow ? 0 : nextDelay - (daysSince ?? 0),
      overdue,
      sentCount,
      totalSteps,
    };
  }

  const nextDay = legacyDays[sentCount];
  const overdue = daysSince !== null && daysSince > nextDay;
  const dueNow = daysSince !== null && daysSince >= nextDay;
  return {
    status: overdue ? 'overdue' : dueNow ? 'due' : 'scheduled',
    nextStep: nextDay,
    daysUntil: dueNow ? 0 : nextDay - (daysSince ?? 0),
    overdue,
    sentCount,
    totalSteps,
  };
}

// ─── Employee digest card ─────────────────────────────────────────────────────
function EmployeeDigestCard({ employee, items, isCurrentUser }) {
  const [expanded, setExpanded] = useState(isCurrentUser);

  const overdueItems = items.filter(i => i.itemStatus === 'overdue');
  const dueItems = items.filter(i => i.itemStatus === 'due');
  const scheduledItems = items.filter(i => i.itemStatus === 'scheduled');
  const doneItems = items.filter(i => i.itemStatus === 'done');

  const urgencyColor = overdueItems.length > 0
    ? 'border-red-200 dark:border-red-800'
    : dueItems.length > 0
    ? 'border-orange-200 dark:border-orange-800'
    : 'border-gray-100 dark:border-gray-700';

  return (
    <div className={cn("bg-white dark:bg-gray-800 rounded-2xl border shadow-sm overflow-hidden", urgencyColor)}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-sm flex-shrink-0">
          {employee.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{employee.name}</span>
            {isCurrentUser && <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 px-1.5 py-0.5 rounded-full">You</span>}
          </div>
          {/* Pill summary */}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {overdueItems.length > 0 && (
              <span className="text-[10px] bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full font-medium">
                {overdueItems.length} overdue
              </span>
            )}
            {dueItems.length > 0 && (
              <span className="text-[10px] bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full font-medium">
                {dueItems.length} due today
              </span>
            )}
            {scheduledItems.length > 0 && (
              <span className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-500 px-2 py-0.5 rounded-full">
                {scheduledItems.length} upcoming
              </span>
            )}
            {doneItems.length > 0 && (
              <span className="text-[10px] bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                {doneItems.length} done
              </span>
            )}
            {items.length === doneItems.length && items.length > 0 && (
              <span className="text-[10px] text-emerald-500 font-medium">All done ✓</span>
            )}
          </div>
        </div>

        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700">
          {items.length === 0 && (
            <div className="px-4 py-3 text-xs text-gray-400">No active leads</div>
          )}
          {[...overdueItems, ...dueItems, ...scheduledItems, ...doneItems].map((item, idx) => (
            <div key={idx} className={cn(
              "px-4 py-2.5 flex items-center gap-3",
              item.itemStatus === 'done' ? 'opacity-50' : ''
            )}>
              {/* Status dot */}
              <div className={cn(
                'w-2 h-2 rounded-full flex-shrink-0',
                item.itemStatus === 'overdue' ? 'bg-red-500' :
                item.itemStatus === 'due' ? 'bg-orange-400' :
                item.itemStatus === 'done' ? 'bg-emerald-400' :
                'bg-blue-300'
              )} />

              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{item.customer_name}</p>
                <p className="text-[10px] text-gray-400 truncate">
                  {item.carModel} · {item.tabLabel}
                </p>
              </div>

              <div className="text-right flex-shrink-0">
                {item.itemStatus === 'overdue' && (
                  <span className="text-[10px] font-semibold text-red-500">Overdue</span>
                )}
                {item.itemStatus === 'due' && item.tab === 'walkin' && item.nextCallDate && (
                  <span className="text-[10px] font-semibold text-orange-500">{format(parseISO(item.nextCallDate), 'd MMM')}</span>
                )}
                {item.itemStatus === 'due' && item.tab !== 'walkin' && (
                  <span className="text-[10px] font-semibold text-orange-500">Send now</span>
                )}
                {item.itemStatus === 'scheduled' && (
                  <span className="text-[10px] text-gray-400">in {item.daysUntil}d</span>
                )}
                {item.itemStatus === 'done' && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                )}
                {item.sentCount !== null && item.totalSteps !== null && (
                  <div className="text-[9px] text-gray-300 dark:text-gray-600 mt-0.5">
                    Step {item.sentCount + 1}/{item.totalSteps}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function DailyDigest() {
  const { currentUser, isLoadingProfile } = useCurrentUser();
  const isAdmin = isAdminUser(currentUser);
  const today = format(new Date(), 'EEEE, d MMM yyyy');

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => supabaseApi.entities.Employee.list(),
    enabled: !!currentUser,
  });

  const { data: sentMessages = [], isLoading: loadingSent, refetch } = useQuery({
    queryKey: ['sent-messages'],
    queryFn: () => supabaseApi.entities.SentMessage.list('-created_at'),
    enabled: !!currentUser,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: () => supabaseApi.entities.Template.list(),
    enabled: !!currentUser,
  });

  const { data: vnaLeads = [], isLoading: loadingVna } = useQuery({
    queryKey: ['vna-stock'],
    queryFn: () => supabaseApi.entities.VNAStock.list(),
    enabled: !!currentUser,
  });

  const { data: matchLeads = [], isLoading: loadingMatch } = useQuery({
    queryKey: ['match-leads'],
    queryFn: () => supabaseApi.entities.MatchedStockCustomer.list(),
    enabled: !!currentUser,
  });

  const { data: greenLeads = [], isLoading: loadingGreen } = useQuery({
    queryKey: ['green-leads'],
    queryFn: () => supabaseApi.entities.GreenFormSubmittedLead.list(),
    enabled: !!currentUser,
  });

  const { data: walkinDigestLeads = [], isLoading: loadingWalkinDigest } = useQuery({
    queryKey: ['walkin-digest'],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('showroom_walkins')
        .select('id, customer_name, next_call_date, model_segment, salesperson_id, salesperson:salesperson_id(id, first_name, last_name), car:car_id(name)')
        .lt('next_call_date', today)
        .in('followup_status', ['pending', 'called']);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentUser,
  });

  const isLoading = loadingSent || loadingVna || loadingMatch || loadingGreen || loadingWalkinDigest;

  // Build digest: for each employee, list all their leads with status
  const digest = useMemo(() => {
    if (isLoading || !currentUser) return [];

    const TAB_CONFIGS = [
      { tab: 'vna', label: 'VNA', leads: vnaLeads, ownerField: 'ca_name' },
      { tab: 'matchtalk', label: 'Match', leads: matchLeads, ownerField: 'ca_name' },
      { tab: 'greenforms', label: 'Green Forms', leads: greenLeads, ownerField: ['employee_full_name', 'ca_name'] },
    ];

    const employeeMap = new Map();

    // Build employee lookup
    const employeeById = new Map();
    const employeeByName = new Map();
    users.forEach(u => {
      const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
      employeeById.set(String(u.id), { id: String(u.id), name: name || u.email || String(u.id), email: u.email });
      if (name) employeeByName.set(name.toLowerCase(), { id: String(u.id), name, email: u.email });
    });

    // For non-admins, only show their own leads
    const currentEmployeeId = String(currentUser.employeeId || '');
    const currentEmployeeName = String(currentUser.fullName || '').toLowerCase();

    TAB_CONFIGS.forEach(({ tab, label, leads }) => {
      leads.forEach(lead => {
        // Find owner
        const salespersonId = String(lead?.salesperson_id || '').trim();
        const caName = String(lead?.ca_name || lead?.employee_full_name || lead?.sales_team || '').trim().toLowerCase();

        let employee = null;
        if (salespersonId) employee = employeeById.get(salespersonId);
        if (!employee && caName) employee = employeeByName.get(caName);
        if (!employee) return; // unassigned → skip

        // Non-admin: only show own
        if (!isAdmin) {
          const isMyLead = (salespersonId && salespersonId === currentEmployeeId) ||
            (caName && caName === currentEmployeeName);
          if (!isMyLead) return;
        }

        const ls = getLeadStatus(lead, tab, sentMessages, templates);
        const carModel = lead?.car_model || lead?.model_name || lead?.ppl || '';
        const customerName = lead?.customer_name || 'Unknown';

        const item = {
          customer_name: customerName,
          carModel,
          tabLabel: label,
          tab,
          itemStatus: ls.status,
          daysUntil: ls.daysUntil,
          sentCount: ls.sentCount,
          totalSteps: ls.totalSteps,
          overdue: ls.overdue,
        };

        const eid = employee.id;
        if (!employeeMap.has(eid)) {
          employeeMap.set(eid, { employee, items: [] });
        }
        employeeMap.get(eid).items.push(item);
      });
    });

    // Add walkin follow-up entries
    walkinDigestLeads.forEach(walkin => {
      const salespersonId = String(walkin?.salesperson_id || '').trim();
      const salespersonName = walkin?.salesperson
        ? [walkin.salesperson.first_name, walkin.salesperson.last_name].filter(Boolean).join(' ').trim().toLowerCase()
        : '';

      let employee = null;
      if (salespersonId) employee = employeeById.get(salespersonId);
      if (!employee && salespersonName) employee = employeeByName.get(salespersonName);
      if (!employee) return; // unassigned → skip

      // Non-admin: only show own
      if (!isAdmin) {
        const isMyLead = (salespersonId && salespersonId === currentEmployeeId) ||
          (salespersonName && salespersonName === currentEmployeeName);
        if (!isMyLead) return;
      }

      const customerName = walkin?.customer_name || 'Unknown';
      const carModel = walkin?.car?.name || '';
      const nextCallDate = walkin?.next_call_date ? parseISO(walkin.next_call_date) : null;
      const today = startOfDay(new Date());
      const isOverdue = nextCallDate && isBefore(nextCallDate, today);

      const item = {
        customer_name: customerName,
        carModel,
        tabLabel: 'Walkin follow-up due',
        tab: 'walkin',
        itemStatus: isOverdue ? 'overdue' : 'due',
        daysUntil: 0,
        sentCount: null,
        totalSteps: null,
        overdue: isOverdue,
        nextCallDate: walkin?.next_call_date,
      };

      const eid = employee.id;
      if (!employeeMap.has(eid)) {
        employeeMap.set(eid, { employee, items: [] });
      }
      employeeMap.get(eid).items.push(item);
    });

    return [...employeeMap.values()].sort((a, b) => {
      const aOverdue = a.items.filter(i => i.itemStatus === 'overdue').length;
      const bOverdue = b.items.filter(i => i.itemStatus === 'overdue').length;
      if (aOverdue !== bOverdue) return bOverdue - aOverdue;
      const aDue = a.items.filter(i => i.itemStatus === 'due').length;
      const bDue = b.items.filter(i => i.itemStatus === 'due').length;
      return bDue - aDue;
    });
  }, [isLoading, currentUser, users, vnaLeads, matchLeads, greenLeads, walkinDigestLeads, sentMessages, templates, isAdmin]);

  // Team-level today summary
  const teamSummary = useMemo(() => {
    const all = digest.flatMap(d => d.items);
    return {
      overdue: all.filter(i => i.itemStatus === 'overdue').length,
      due: all.filter(i => i.itemStatus === 'due').length,
      done: all.filter(i => i.itemStatus === 'done').length,
      total: all.length,
    };
  }, [digest]);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <div className="px-4 pt-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Daily Digest</h1>
            <p className="text-xs text-gray-400 mt-0.5">{today}</p>
          </div>
          <button
            onClick={() => refetch()}
            className="p-2 rounded-xl border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Team summary bar */}
        {isAdmin && (
          <div className="grid grid-cols-4 gap-2 mb-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-3 text-center border border-gray-100 dark:border-gray-700">
              <div className="text-lg font-bold text-gray-900 dark:text-white">{teamSummary.total}</div>
              <div className="text-[10px] text-gray-400">Total</div>
            </div>
            <div className={cn("rounded-xl p-3 text-center border", teamSummary.overdue > 0 ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700")}>
              <div className={cn("text-lg font-bold", teamSummary.overdue > 0 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white")}>{teamSummary.overdue}</div>
              <div className="text-[10px] text-gray-400">Overdue</div>
            </div>
            <div className={cn("rounded-xl p-3 text-center border", teamSummary.due > 0 ? "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800" : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700")}>
              <div className={cn("text-lg font-bold", teamSummary.due > 0 ? "text-orange-600 dark:text-orange-400" : "text-gray-900 dark:text-white")}>{teamSummary.due}</div>
              <div className="text-[10px] text-gray-400">Due Today</div>
            </div>
            <div className={cn("rounded-xl p-3 text-center border", teamSummary.done > 0 ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800" : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700")}>
              <div className={cn("text-lg font-bold", teamSummary.done > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-gray-900 dark:text-white")}>{teamSummary.done}</div>
              <div className="text-[10px] text-gray-400">Done</div>
            </div>
          </div>
        )}

        {/* Digest list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="h-20 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 animate-pulse" />
            ))}
          </div>
        ) : digest.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
            <Bell className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">All caught up!</p>
            <p className="text-xs mt-1">No active leads to follow up on.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {digest.map(({ employee, items }) => (
              <EmployeeDigestCard
                key={employee.id}
                employee={employee}
                items={items}
                isCurrentUser={String(employee.id) === String(currentUser?.employeeId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
