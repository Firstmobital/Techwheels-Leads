// @ts-nocheck
import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, ChevronDown, ChevronUp, PhoneCall, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { supabaseApi } from '@/api/supabaseService';
import { useCurrentUser } from '@/lib/CurrentUserContext';
import LogCallModal from './LogCallModal';
import { buildCallUrl, buildWhatsAppUrl } from '@/utils/phone';

const SEGMENTS = ['All', 'EV', 'Premium SUV', 'Others'];

const VERDICT_LABELS = {
  very_interested: 'Very interested',
  needs_info: 'Needs info',
  not_reachable: 'Not reachable',
  call_later: 'Call later',
  needs_discount: 'Needs discount',
  escalate: 'Escalate',
  booked: 'Booked',
  not_interested: 'Not interested',
};

const VERDICT_STYLES = {
  very_interested: 'bg-green-50 text-green-800 border-green-200',
  needs_info: 'bg-blue-50 text-blue-800 border-blue-200',
  not_reachable: 'bg-gray-100 text-gray-700 border-gray-200',
  call_later: 'bg-amber-50 text-amber-800 border-amber-200',
  needs_discount: 'bg-amber-50 text-amber-800 border-amber-200',
  escalate: 'bg-purple-50 text-purple-800 border-purple-200',
  booked: 'bg-green-50 text-green-800 border-green-200',
  not_interested: 'bg-gray-100 text-gray-700 border-gray-200',
};

function fmtDate(val) {
  if (!val) return '—';
  try {
    const d = typeof val === 'string' ? parseISO(val) : val;
    return format(d, 'dd MMM');
  } catch {
    return '—';
  }
}

function daysAgoLabel(val) {
  if (!val) return null;
  try {
    const d = typeof val === 'string' ? parseISO(val) : val;
    const diff = differenceInCalendarDays(new Date(), d);
    if (diff === 0) return 'Today';
    if (diff === 1) return '1 day ago';
    return `${diff} days ago`;
  } catch {
    return null;
  }
}

function isOverdue(val) {
  if (!val) return false;
  try {
    const d = typeof val === 'string' ? parseISO(val) : val;
    return differenceInCalendarDays(new Date(), d) > 0;
  } catch {
    return false;
  }
}

function VerdictBadge({ verdict }) {
  if (!verdict) {
    return (
      <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full border bg-gray-50 text-gray-500 border-gray-200">
        Not called
      </span>
    );
  }
  const label = VERDICT_LABELS[verdict] || verdict;
  const style = VERDICT_STYLES[verdict] || 'bg-gray-50 text-gray-600 border-gray-200';
  return (
    <span className={cn('inline-block text-[10px] font-medium px-2 py-0.5 rounded-full border', style)}>
      {label}
    </span>
  );
}

function SegmentBadge({ segment }) {
  const style =
    segment === 'EV'
      ? 'bg-green-50 text-green-800 border-green-200'
      : segment === 'Premium SUV'
      ? 'bg-purple-50 text-purple-800 border-purple-200'
      : 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <span className={cn('inline-block text-[10px] font-medium px-2 py-0.5 rounded-full border mt-1', style)}>
      {segment || 'Others'}
    </span>
  );
}

function CallHistoryRows({ callHistory }) {
  if (!Array.isArray(callHistory) || callHistory.length === 0) {
    return (
      <p className="text-xs text-gray-400 py-2">No calls logged yet — this is the first contact.</p>
    );
  }
  return (
    <div>
      {[...callHistory]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .map((call, i) => (
          <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
            <span className="text-[11px] text-gray-400 flex-shrink-0 w-14 pt-0.5">{fmtDate(call.created_at)}</span>
            <VerdictBadge verdict={call.verdict} />
            {call.notes && (
              <span className="text-xs text-gray-600 flex-1">{call.notes}</span>
            )}
          </div>
        ))}
    </div>
  );
}

export default function WalkinFollowupTab() {
  const queryClient = useQueryClient();
  const { currentUser } = useCurrentUser();

  const [activeSeg, setActiveSeg] = useState('All');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [subTab, setSubTab] = useState('pending');
  const [expandedId, setExpandedId] = useState(null);
  const [selectedWalkin, setSelectedWalkin] = useState(null);

  const { data: queueData = [], isLoading } = useQuery({
    queryKey: ['walkin-followup-queue'],
    queryFn: () => supabaseApi.walkinFollowup.getQueue(),
    staleTime: 1000 * 60 * 5,
  });

  const logCallMutation = useMutation({
    mutationFn: (payload) =>
      supabaseApi.walkinFollowup.logCall({
        ...payload,
        caller_id: currentUser?.authUserId || currentUser?.id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['walkin-followup-queue'] });
      setSelectedWalkin(null);
    },
  });

  const branches = useMemo(() => {
    const set = new Set();
    queueData.forEach((w) => { if (w.branch) set.add(w.branch); });
    return [...set].sort();
  }, [queueData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return queueData.filter((w) => {
      if (activeSeg !== 'All' && w.model_segment !== activeSeg) return false;
      if (q) {
        const name = String(w.customer_name || '').toLowerCase();
        const phone = String(w.mobile_number || '').toLowerCase();
        const exec = `${w.salesperson?.first_name || ''} ${w.salesperson?.last_name || ''}`.toLowerCase();
        if (!name.includes(q) && !phone.includes(q) && !exec.includes(q)) return false;
      }
      if (statusFilter !== 'all' && w.followup_status !== statusFilter) return false;
      if (branchFilter !== 'all' && w.branch !== branchFilter) return false;
      return true;
    });
  }, [queueData, activeSeg, search, statusFilter, branchFilter]);

  const pendingRows = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return filtered.filter((w) => {
      if (w.followup_status === 'booked' || w.followup_status === 'not_interested') return false;
      if (!w.next_call_date) return w.followup_status === 'pending';
      const due = new Date(w.next_call_date);
      due.setHours(0, 0, 0, 0);
      return due.getTime() <= today.getTime();
    });
  }, [filtered]);

  const displayRows = subTab === 'pending' ? pendingRows : filtered;

  const overdueCount = useMemo(
    () => queueData.filter((w) => isOverdue(w.next_call_date) && !['booked', 'lost'].includes(w.followup_status)).length,
    [queueData]
  );

  const toggleExpand = useCallback((id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Filters */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 space-y-2 sticky top-0 z-20">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1.5 flex-wrap flex-1">
            {SEGMENTS.map((s) => (
              <button
                key={s}
                onClick={() => setActiveSeg(s)}
                className={cn(
                  'text-xs font-medium px-3 py-1.5 rounded-full border transition-all',
                  activeSeg === s
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['walkin-followup-queue'] })}
            disabled={isLoading}
            className="p-2 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[160px]">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, exec..."
              className="w-full rounded-lg border border-gray-200 bg-white pl-3 pr-7 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-base leading-none"
              >
                ×
              </button>
            )}
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-gray-700 focus:outline-none"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="called">Called</option>
            <option value="escalated">Escalated</option>
            <option value="not_interested">Not interested</option>
          </select>
          {branches.length > 0 && (
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="text-xs rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-gray-700 focus:outline-none"
            >
              <option value="all">All branches</option>
              {branches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex gap-1">
          <button
            onClick={() => setSubTab('pending')}
            className={cn(
              'flex-1 rounded-xl px-3 py-1.5 text-xs font-medium transition-all',
              subTab === 'pending' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
            )}
          >
            Pending today ({pendingRows.length})
          </button>
          <button
            onClick={() => setSubTab('all')}
            className={cn(
              'flex-1 rounded-xl px-3 py-1.5 text-xs font-medium transition-all',
              subTab === 'all' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
            )}
          >
            All walk-ins ({filtered.length})
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex gap-4 text-xs text-gray-500">
        <span>Showing <strong className="text-gray-800">{displayRows.length}</strong> of {queueData.length}</span>
        {overdueCount > 0 && (
          <span className="text-red-600 font-medium">{overdueCount} overdue</span>
        )}
        <span>EV: <strong className="text-gray-800">{queueData.filter((w) => w.model_segment === 'EV').length}</strong></span>
        <span>Not called: <strong className="text-gray-800">{queueData.filter((w) => !w.call_count).length}</strong></span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto pb-24">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : displayRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <p className="text-sm font-medium">No walk-ins found</p>
            <p className="text-xs mt-1">Try adjusting filters</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm bg-white" style={{ minWidth: 880 }}>
            <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
              <tr>
                <th className="w-8 px-3 py-3" />
                <th className="px-3 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Customer</th>
                <th className="px-3 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Phone</th>
                <th className="px-3 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Car</th>
                <th className="px-3 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Sales exec · Branch</th>
                <th className="px-3 py-3 text-center text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Calls</th>
                <th className="px-3 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Last outcome</th>
                <th className="px-3 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Last followup</th>
                <th className="px-3 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Next call</th>
                <th className="px-3 py-3 text-left text-[11px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((walkin) => {
                const isExpanded = expandedId === walkin.id;
                const overdue = isOverdue(walkin.next_call_date);
                const phone = walkin.mobile_number || '';
                const execName = walkin.salesperson
                  ? `${walkin.salesperson.first_name || ''} ${walkin.salesperson.last_name || ''}`.trim()
                  : '—';
                const lastFollowupDate = walkin.last_call_date;
                const daysAgo = daysAgoLabel(lastFollowupDate);

                return (
                  <React.Fragment key={walkin.id}>
                    <tr
                      className={cn(
                        'border-b border-gray-100 hover:bg-gray-50 transition-colors',
                        overdue ? 'border-l-2 border-l-red-400' : 'border-l-2 border-l-transparent'
                      )}
                    >
                      <td className="px-3 py-3 w-8">
                        <button
                          onClick={() => toggleExpand(walkin.id)}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          {isExpanded
                            ? <ChevronUp className="w-3.5 h-3.5" />
                            : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </td>

                      <td className="px-3 py-3">
                        <div className="font-medium text-gray-900 text-sm whitespace-nowrap">{walkin.customer_name || '—'}</div>
                      </td>

                      <td className="px-3 py-3">
                        <span className="text-xs text-gray-500 font-mono whitespace-nowrap">{phone || '—'}</span>
                      </td>

                      <td className="px-3 py-3">
                        <div className="text-xs text-gray-700 whitespace-nowrap">{walkin.car?.name || '—'}</div>
                        <SegmentBadge segment={walkin.model_segment} />
                      </td>

                      <td className="px-3 py-3">
                        <div className="text-xs font-medium text-gray-800 whitespace-nowrap">{execName}</div>
                        {walkin.branch && (
                          <div className="text-[11px] text-gray-400 mt-0.5 whitespace-nowrap">{walkin.branch}</div>
                        )}
                      </td>

                      <td className="px-3 py-3 text-center">
                        <span className="text-sm font-medium text-gray-800">{walkin.call_count ?? 0}</span>
                        <span className="text-[11px] text-gray-400">/5</span>
                      </td>

                      <td className="px-3 py-3">
                        <VerdictBadge verdict={walkin.last_verdict} />
                      </td>

                      <td className="px-3 py-3">
                        {lastFollowupDate ? (
                          <div>
                            <div className="text-xs text-gray-800 whitespace-nowrap">Last called: {fmtDate(lastFollowupDate)}</div>
                            {daysAgo && (
                              <div className="text-[11px] text-gray-400 mt-0.5">{daysAgo}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        {walkin.next_call_date ? (
                          <div>
                            <div className={cn('text-xs whitespace-nowrap', overdue ? 'text-red-600 font-medium' : 'text-gray-800')}>
                              {fmtDate(walkin.next_call_date)}
                            </div>
                            <div className={cn('text-[11px] mt-0.5', overdue ? 'text-red-500' : 'text-gray-400')}>
                              {overdue ? 'Overdue' : 'Upcoming'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          {phone && (
                            <a
                              href={buildCallUrl(phone)}
                              className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors"
                              title="Call"
                            >
                              <PhoneCall className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {phone && (
                            <a
                              href={buildWhatsAppUrl(phone, '')}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors"
                              title="WhatsApp"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            onClick={() => setSelectedWalkin(walkin)}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors whitespace-nowrap"
                          >
                            Log call
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Inline remarks */}
                    {isExpanded && (
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <td colSpan={10} className="px-8 py-3">
                          <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-2">
                            Call history ({walkin.call_count ?? 0})
                          </div>
                          <CallHistoryRows callHistory={walkin.call_history} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selectedWalkin && (
        <LogCallModal
          open={Boolean(selectedWalkin)}
          walkin={selectedWalkin}
          onClose={() => setSelectedWalkin(null)}
          onSubmit={async (payload) => {
            await logCallMutation.mutateAsync(payload);
          }}
        />
      )}
    </div>
  );
}