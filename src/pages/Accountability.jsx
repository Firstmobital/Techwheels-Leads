import React, { useMemo, useState } from 'react';
import { supabaseApi } from '@/api/supabaseService';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/CurrentUserContext';
import { isAdminUser } from '@/lib/authUserUtils';
import { differenceInDays } from 'date-fns';
import { TrendingUp, TrendingDown, Minus, Award, AlertTriangle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── helpers ──────────────────────────────────────────────────────────────────
const toInt = (v, fb) => { const p = Number.parseInt(String(v ?? '').trim(), 10); return Number.isFinite(p) ? p : fb; };

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
];

function getDateRange(range) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === 'this_week') {
    const start = new Date(today);
    const offset = (today.getDay() + 6) % 7;
    start.setDate(today.getDate() - offset);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return { start, end };
  }
  if (range === 'this_month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { start, end };
  }
  return { start: today, end: today };
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function ScoreBadge({ score }) {
  const level = score >= 80 ? 'high' : score >= 50 ? 'mid' : 'low';
  return (
    <div className={cn(
      'flex items-center justify-center w-12 h-12 rounded-full font-bold text-sm flex-shrink-0',
      level === 'high' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
      level === 'mid' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    )}>
      {score}%
    </div>
  );
}

function MiniBar({ value, color }) {
  return (
    <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden w-full">
      <div
        className={cn("h-full rounded-full transition-all", color)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export default function Accountability() {
  const { currentUser, isLoadingProfile } = useCurrentUser();
  const isAdmin = isAdminUser(currentUser);
  const [dateRange, setDateRange] = useState('this_week');

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => supabaseApi.entities.Employee.list(),
    enabled: isAdmin,
  });

  const { data: sentMessages = [], isLoading: loadingSent } = useQuery({
    queryKey: ['sent-messages-accountability'],
    queryFn: () => supabaseApi.entities.SentMessage.list('-created_at'),
    enabled: isAdmin,
  });

  const { data: vnaLeads = [] } = useQuery({
    queryKey: ['vna-stock'],
    queryFn: () => supabaseApi.entities.VNAStock.list(),
    enabled: isAdmin,
  });

  const { data: matchLeads = [] } = useQuery({
    queryKey: ['match-leads'],
    queryFn: () => supabaseApi.entities.MatchedStockCustomer.list(),
    enabled: isAdmin,
  });

  const { data: greenLeads = [] } = useQuery({
    queryKey: ['green-leads'],
    queryFn: () => supabaseApi.entities.GreenFormSubmittedLead.list(),
    enabled: isAdmin,
  });

  const { start, end } = useMemo(() => getDateRange(dateRange), [dateRange]);
  const startStr = formatDate(start);
  const endStr = formatDate(end);

  // Total days in range (for expected daily sends)
  const rangeDays = differenceInDays(end, start) + 1;

  // Build per-user stats
  const userStats = useMemo(() => {
    if (!users.length || !sentMessages.length) return [];

    const allLeads = [...vnaLeads, ...matchLeads, ...greenLeads];

    // Count total active leads assigned to each employee
    const leadsByEmployee = new Map();
    allLeads.forEach(lead => {
      const eid = String(lead?.salesperson_id || lead?.assigned_to || lead?.ca_name || '').trim();
      if (!eid) return;
      const cur = leadsByEmployee.get(eid) || 0;
      leadsByEmployee.set(eid, cur + 1);
    });

    return users.map(user => {
      const eid = String(user.id);
      const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.email || `#${eid}`;

      // Messages sent by this user in the date range
      const userMessages = sentMessages.filter(m => {
        const sid = String(m?.sent_by_employee_id || '');
        const createdDate = String(m?.created_at || '').split('T')[0];
        return sid === eid && createdDate >= startStr && createdDate <= endStr;
      });

      // Messages sent on time vs total expected
      // We consider messages sent = accountability actions
      const totalSent = userMessages.length;

      // Break down by tab/source
      const bySource = {};
      userMessages.forEach(m => {
        const src = m.lead_source || 'unknown';
        bySource[src] = (bySource[src] || 0) + 1;
      });

      // On-time = sent on the day it was due (sent_via 'whatsapp_link')
      // We approximate: all sent messages count as on-time for now
      // (overdue detection needs due_date stored — this is MVP)
      const onTimeSent = userMessages.filter(m => m.sent_via === 'whatsapp_link').length;

      // Assigned leads count (approximate by name or id)
      const assignedLeads = leadsByEmployee.get(eid) ||
        leadsByEmployee.get(name) ||
        leadsByEmployee.get(name.toLowerCase()) || 0;

      // Score: weighted combo of send volume and consistency
      // Base: (sent / max(1, assignedLeads * rangeDays * 0.3)) * 100, capped at 100
      const expectedMin = Math.max(1, Math.floor(assignedLeads * 0.3));
      const volumeScore = Math.min(100, Math.round((totalSent / expectedMin) * 100));

      // Daily consistency: how many days in range had at least one send?
      const activeDays = new Set(userMessages.map(m => String(m.created_at || '').split('T')[0])).size;
      const consistencyScore = Math.min(100, Math.round((activeDays / rangeDays) * 100));

      // Combined score
      const score = Math.round(volumeScore * 0.6 + consistencyScore * 0.4);

      return {
        id: eid,
        name,
        email: user.email || '',
        totalSent,
        assignedLeads,
        activeDays,
        rangeDays,
        score,
        volumeScore,
        consistencyScore,
        bySource,
        onTimeSent,
      };
    })
    .filter(u => u.assignedLeads > 0 || u.totalSent > 0)
    .sort((a, b) => b.score - a.score);
  }, [users, sentMessages, vnaLeads, matchLeads, greenLeads, startStr, endStr, rangeDays]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 text-sm gap-2">
        <Award className="w-10 h-10" />
        <p>Accountability dashboard is for admins only.</p>
      </div>
    );
  }

  if (isLoadingProfile || loadingSent) {
    return (
      <div className="p-4 space-y-3">
        {[1,2,3].map(i => (
          <div key={i} className="h-20 bg-gray-100 dark:bg-gray-700 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  // Team-level summary
  const teamAvgScore = userStats.length
    ? Math.round(userStats.reduce((s, u) => s + u.score, 0) / userStats.length)
    : 0;
  const topPerformer = userStats[0];
  const needsAttention = userStats.filter(u => u.score < 40);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <div className="px-4 pt-4">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Accountability</h1>
          <p className="text-xs text-gray-400 mt-0.5">Follow-up score per salesperson</p>
        </div>

        {/* Date range selector */}
        <div className="flex gap-2 mb-4 bg-white dark:bg-gray-800 p-1 rounded-xl border border-gray-100 dark:border-gray-700">
          {RANGE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setDateRange(opt.value)}
              className={cn(
                'flex-1 py-2 rounded-lg text-xs font-semibold transition-all',
                dateRange === opt.value
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Team summary cards */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700 text-center">
            <div className="text-xl font-bold text-gray-900 dark:text-white">{teamAvgScore}%</div>
            <div className="text-[10px] text-gray-400 mt-0.5">Team avg</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700 text-center">
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{userStats.filter(u => u.score >= 80).length}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">On track</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700 text-center">
            <div className="text-xl font-bold text-red-500 dark:text-red-400">{needsAttention.length}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">Need action</div>
          </div>
        </div>

        {/* Needs attention banner */}
        {needsAttention.length > 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 mb-4 flex gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-red-700 dark:text-red-400">Needs attention</p>
              <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">
                {needsAttention.map(u => u.name).join(', ')} — low follow-up score
              </p>
            </div>
          </div>
        )}

        {/* Leaderboard */}
        <div className="space-y-3">
          {userStats.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
              <Clock className="w-8 h-8 mb-2" />
              <p className="text-sm">No data for this period</p>
            </div>
          )}
          {userStats.map((u, idx) => (
            <div key={u.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
              <div className="flex items-center gap-3">
                {/* Rank */}
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0",
                  idx === 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" :
                  idx === 1 ? "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300" :
                  idx === 2 ? "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400" :
                  "bg-gray-100 text-gray-500 dark:bg-gray-700"
                )}>
                  {idx + 1}
                </div>

                {/* Name + email */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{u.name}</p>
                  <p className="text-[10px] text-gray-400 truncate">{u.email}</p>
                </div>

                {/* Score circle */}
                <ScoreBadge score={u.score} />
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className="text-center">
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{u.totalSent}</p>
                  <p className="text-[10px] text-gray-400">Msgs sent</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{u.assignedLeads}</p>
                  <p className="text-[10px] text-gray-400">Leads assigned</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{u.activeDays}/{u.rangeDays}</p>
                  <p className="text-[10px] text-gray-400">Active days</p>
                </div>
              </div>

              {/* Score breakdown bars */}
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 w-20 flex-shrink-0">Volume</span>
                  <MiniBar value={u.volumeScore} color="bg-blue-400" />
                  <span className="text-[10px] font-medium text-gray-500 w-8 text-right">{u.volumeScore}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 w-20 flex-shrink-0">Consistency</span>
                  <MiniBar value={u.consistencyScore} color={u.consistencyScore >= 60 ? "bg-emerald-400" : "bg-orange-400"} />
                  <span className="text-[10px] font-medium text-gray-500 w-8 text-right">{u.consistencyScore}%</span>
                </div>
              </div>

              {/* Source breakdown */}
              {Object.keys(u.bySource).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700">
                  {Object.entries(u.bySource).map(([src, count]) => (
                    <span key={src} className="text-[10px] bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-gray-600 px-2 py-0.5 rounded-full">
                      {src}: {count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
