// @ts-nocheck
import React, { useMemo, useState } from 'react';
import { supabaseApi } from '@/api/supabaseService';
import { useQuery } from '@tanstack/react-query';
import { BarChart2, CheckCircle2, RefreshCw, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/lib/CurrentUserContext';
import { isAdminUser } from '@/lib/authUserUtils';

const SUCCESS_STATUSES = new Set(['sent']);

const formatDateOnly = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDateRange = (dateRange, customStart, customEnd) => {
  const now = new Date();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (dateRange === 'this_week') {
    const start = new Date(todayDate);
    const mondayOffset = (todayDate.getDay() + 6) % 7;
    start.setDate(todayDate.getDate() - mondayOffset);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
      startDate: formatDateOnly(start),
      endDate: formatDateOnly(end),
    };
  }

  if (dateRange === 'this_month') {
    const start = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
    const end = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0);
    return {
      startDate: formatDateOnly(start),
      endDate: formatDateOnly(end),
    };
  }

  if (dateRange === 'custom') {
    const safeStart = String(customStart || '').trim();
    const safeEnd = String(customEnd || '').trim();

    if (safeStart && safeEnd) {
      return safeStart <= safeEnd
        ? { startDate: safeStart, endDate: safeEnd }
        : { startDate: safeEnd, endDate: safeStart };
    }

    if (safeStart) return { startDate: safeStart, endDate: safeStart };
    if (safeEnd) return { startDate: safeEnd, endDate: safeEnd };
  }

  const today = formatDateOnly(todayDate);
  return { startDate: today, endDate: today };
};

// Templates moved to Home dashboard
export default function Report() {
  const [dateRange, setDateRange] = useState('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const { currentUser, isLoadingProfile } = useCurrentUser();

  const isAdmin = isAdminUser(currentUser);

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => supabaseApi.entities.Employee.list(),
    enabled: !!currentUser,
  });

  const { data: sentMessages = [], isLoading, refetch } = useQuery({
    queryKey: ['sent-messages-report'],
    queryFn: () => supabaseApi.entities.SentMessage.list('-created_at'),
    enabled: !!currentUser,
  });

  const { data: vanaLeads = [] } = useQuery({
    queryKey: ['vna-stock'],
    queryFn: () => supabaseApi.entities.VNAStock.list(),
    enabled: !!currentUser,
  });
  const { data: matchLeads = [] } = useQuery({
    queryKey: ['match-leads'],
    queryFn: () => supabaseApi.entities.MatchedStockCustomer.list(),
    enabled: !!currentUser,
  });
  const { data: greenLeads = [] } = useQuery({
    queryKey: ['green-leads'],
    queryFn: () => supabaseApi.entities.GreenFormSubmittedLead.list(),
    enabled: !!currentUser,
  });

  const totalLeads = vanaLeads.length + matchLeads.length + greenLeads.length;

  const { startDate, endDate } = useMemo(
    () => getDateRange(dateRange, customStart, customEnd),
    [dateRange, customEnd, customStart],
  );

  const selectedRangeLabel = useMemo(() => {
    if (dateRange === 'today') return 'Today';
    if (dateRange === 'this_week') return 'This Week';
    if (dateRange === 'this_month') return 'This Month';
    if (dateRange === 'custom') {
      if (startDate && endDate) {
        return startDate === endDate ? `Custom (${startDate})` : `Custom (${startDate} to ${endDate})`;
      }
      return 'Custom';
    }
    return 'Selected Range';
  }, [dateRange, endDate, startDate]);

  const filteredMessages = useMemo(() => {
    if (!currentUser) return [];
    const visibleMessages = isAdmin
      ? sentMessages
      : sentMessages.filter(m => String(m.sent_by_employee_id || '') === String(currentUser.employeeId || ''));

    return visibleMessages.filter((message) => {
      const createdDate = String(message?.created_at || '').split('T')[0];
      if (!createdDate) return false;
      return createdDate >= startDate && createdDate <= endDate;
    });
  }, [sentMessages, currentUser, isAdmin, startDate, endDate]);

  // Group key: sent_by_employee_id + date(created_at)
  const groupedBySenderAndDate = useMemo(() => {
    const grouped = {};

    filteredMessages.forEach((m) => {
      if (!m.created_at) return;
      const senderId = String(m.sent_by_employee_id || 'unassigned');
      const sentDate = m.created_at.split('T')[0];
      if (!sentDate) return;

      const key = `${senderId}::${sentDate}`;
      if (!grouped[key]) {
        grouped[key] = {
          sent_by_employee_id: senderId,
          sent_date: sentDate,
          total_messages: 0,
          successful_messages: 0,
          sources: {},
        };
      }

      grouped[key].total_messages += 1;
      if (SUCCESS_STATUSES.has((m.status ?? 'sent').toLowerCase())) {
        grouped[key].successful_messages += 1;
      }

      if (m.lead_source) {
        grouped[key].sources[m.lead_source] = (grouped[key].sources[m.lead_source] || 0) + 1;
      }
    });

    return Object.values(grouped);
  }, [filteredMessages]);

  const todayGrouped = useMemo(() => {
    return groupedBySenderAndDate.filter((g) => g.sent_date >= startDate && g.sent_date <= endDate);
  }, [groupedBySenderAndDate, startDate, endDate]);

  const messagesPerUser = useMemo(() => {
    const map = {};
    todayGrouped.forEach((g) => {
      if (!map[g.sent_by_employee_id]) {
        map[g.sent_by_employee_id] = {
          sent_by_employee_id: g.sent_by_employee_id,
          total_messages: 0,
          successful_messages: 0,
          sources: {},
        };
      }

      map[g.sent_by_employee_id].total_messages += g.total_messages;
      map[g.sent_by_employee_id].successful_messages += g.successful_messages;
      Object.entries(g.sources).forEach(([source, count]) => {
        map[g.sent_by_employee_id].sources[source] = (map[g.sent_by_employee_id].sources[source] || 0) + Number(count || 0);
      });
    });

    return Object.entries(map)
      .map(([employeeId, data]) => {
        const user = users.find(u => String(u.id) === String(employeeId));
        const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
        return {
          employeeId,
          name: fullName || user?.email || `Employee #${employeeId}`,
          total_messages: data.total_messages,
          successful_messages: data.successful_messages,
          success_rate: data.total_messages > 0
            ? Math.round((data.successful_messages / data.total_messages) * 100)
            : 0,
          sources: data.sources,
        };
      })
      .sort((a, b) => b.total_messages - a.total_messages);
  }, [todayGrouped, users]);

  const totalMessagesSent = useMemo(
    () => todayGrouped.reduce((sum, g) => sum + g.total_messages, 0),
    [todayGrouped],
  );

  const successfulMessages = useMemo(
    () => todayGrouped.reduce((sum, g) => sum + g.successful_messages, 0),
    [todayGrouped],
  );

  const successRate = totalMessagesSent > 0
    ? Math.round((successfulMessages / totalMessagesSent) * 100)
    : 0;

  const handleDownloadCSV = () => {
    const headers = ['Created At', 'Lead Source', 'Source Record ID', 'Customer Name', 'Mobile Number', 'Message Text', 'Template ID', 'Sent By Employee ID', 'Sent Via', 'Status'];
    const rows = filteredMessages.map(m => [
      m.created_at ? new Date(m.created_at).toLocaleString('en-IN') : '',
      m.lead_source || '',
      m.source_record_id || '',
      m.customer_name || '',
      m.mobile_number || '',
      m.message_text || '',
      m.template_id || '',
      m.sent_by_employee_id || '',
      m.sent_via || '',
      m.status ?? 'sent',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sent-messages-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalContacted = totalMessagesSent;
  const totalPending = Math.max(0, totalLeads - new Set(filteredMessages.map(m => `${m.lead_source || ''}:${m.source_record_id || ''}`)).size);

  const leaderboardMessages = useMemo(() => {
    return sentMessages.filter((message) => {
      const createdDate = String(message?.created_at || '').split('T')[0];
      if (!createdDate) return false;
      return createdDate >= startDate && createdDate <= endDate;
    });
  }, [sentMessages, startDate, endDate]);

  const rankedSalespersons = useMemo(() => {
    const grouped = new Map();

    leaderboardMessages.forEach((message) => {
      const employeeId = String(message?.sent_by_employee_id || 'unassigned');
      if (!grouped.has(employeeId)) {
        grouped.set(employeeId, {
          employeeId,
          messages_sent: 0,
          leadIds: new Set(),
          aiLeadIds: new Set(),
        });
      }

      const row = grouped.get(employeeId);
      row.messages_sent += 1;

      const sourceRecordId = String(message?.source_record_id || '').trim();
      if (sourceRecordId) {
        row.leadIds.add(sourceRecordId);
      }

      // Approximation: treat unique AI leads messaged in range as green-form-opened count proxy.
      const leadSource = String(message?.lead_source || '').trim().toLowerCase();
      if (leadSource === 'ai' && sourceRecordId) {
        row.aiLeadIds.add(sourceRecordId);
      }
    });

    const rows = Array.from(grouped.values())
      .map((row) => {
        const user = users.find((item) => String(item?.id) === String(row.employeeId));
        const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();

        return {
          employeeId: row.employeeId,
          name: fullName || user?.email || `Employee #${row.employeeId}`,
          messages_sent: row.messages_sent,
          unique_leads_contacted: row.leadIds.size,
          green_forms_opened: row.aiLeadIds.size,
        };
      })
      .sort((a, b) => b.messages_sent - a.messages_sent)
      .map((row, index) => ({
        ...row,
        rank: index + 1,
      }));

    return rows;
  }, [leaderboardMessages, users]);

  const topMessagesSent = rankedSalespersons[0]?.messages_sent ?? 0;

  const sourceColors = {
    walkin: 'bg-amber-100 text-amber-700',
    ivr: 'bg-emerald-100 text-emerald-700',
    ai: 'bg-blue-100 text-blue-700',
  };
  const sourceLabels = { walkin: 'Walk-in', ivr: 'IVR', ai: 'AI' };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-5 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Daily Report</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={handleDownloadCSV} className="rounded-xl h-9 w-9" title="Download CSV">
              <Download className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={refetch} disabled={isLoading} className="rounded-xl h-9 w-9">
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 pb-24">
        {isLoadingProfile && !currentUser ? (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-sm text-gray-500">
            Loading your profile...
          </div>
        ) : null}

        <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 space-y-3">
          <div className="flex flex-wrap gap-2">
            {[
              { value: 'today', label: 'Today' },
              { value: 'this_week', label: 'This Week' },
              { value: 'this_month', label: 'This Month' },
              { value: 'custom', label: 'Custom' },
            ].map((option) => {
              const isActive = dateRange === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setDateRange(option.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${isActive ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {dateRange === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(event) => setCustomStart(event.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs"
              />
              <input
                type="date"
                value={customEnd}
                onChange={(event) => setCustomEnd(event.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs"
              />
            </div>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
            <p className="text-2xl font-bold text-gray-900">{totalLeads}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Total Leads</p>
          </div>
          <div className="bg-emerald-50 rounded-2xl p-3 shadow-sm border border-emerald-100 text-center">
            <p className="text-2xl font-bold text-emerald-700">{totalContacted}</p>
            <p className="text-[11px] text-emerald-500 mt-0.5">Messages Sent ({selectedRangeLabel})</p>
          </div>
          <div className="bg-amber-50 rounded-2xl p-3 shadow-sm border border-amber-100 text-center">
            <p className="text-2xl font-bold text-amber-700">{successRate}%</p>
            <p className="text-[11px] text-amber-500 mt-0.5">Success Rate ({selectedRangeLabel})</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
          <p className="text-sm text-gray-500">Pending Leads ({selectedRangeLabel}): <span className="font-semibold text-gray-900">{totalPending}</span></p>
        </div>

        {/* Per Salesperson */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-gray-500" />
            <h2 className="font-semibold text-sm text-gray-800">Salesperson Performance ({selectedRangeLabel})</h2>
          </div>

          {messagesPerUser.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">No activity in selected range</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {messagesPerUser.map((person) => (
                <div key={person.employeeId} className="px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">
                    {person.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{person.name}</p>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {Object.entries(person.sources).map(([source, count]) => (
                        <span key={source} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${sourceColors[source] || 'bg-gray-100 text-gray-600'}`}>
                          {sourceLabels[source] || source}: {count}
                        </span>
                      ))}
                      {person.total_messages === 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
                          No activity
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="flex items-center gap-1 justify-end">
                      <CheckCircle2 className={`w-3.5 h-3.5 ${person.total_messages > 0 ? 'text-emerald-500' : 'text-gray-300'}`} />
                      <span className={`text-sm font-bold ${person.total_messages > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>
                        {person.total_messages}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400">sent ({person.success_rate}% success)</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Lead source breakdown for selected range */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="font-semibold text-sm text-gray-800">{selectedRangeLabel} Breakdown by Lead Source</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {['walkin', 'ivr', 'ai'].map(source => {
              const count = filteredMessages
                .filter((m) => {
                  const createdDate = String(m?.created_at || '').split('T')[0];
                  if (!createdDate) return false;
                  return createdDate >= startDate && createdDate <= endDate && m.lead_source === source;
                })
                .length;
              const total = Math.max(totalMessagesSent, 1);
              const pct = Math.round((count / total) * 100);
              return (
                <div key={source} className="px-4 py-3">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm font-medium text-gray-700">{sourceLabels[source]}</span>
                    <span className="text-xs text-gray-500">{count} / {total}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${source === 'walkin' ? 'bg-amber-400' : source === 'ivr' ? 'bg-emerald-400' : 'bg-blue-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                    <p className="text-[10px] text-gray-400 mt-1">{pct}% contacted ({selectedRangeLabel})</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="font-semibold text-sm text-gray-800">Leaderboard</h2>
          </div>

          {rankedSalespersons.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">No leaderboard data in selected range</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {rankedSalespersons.map((person) => {
                const isCurrentUser = String(person.employeeId) === String(currentUser?.employeeId || '');
                const medal = person.rank === 1 ? '🥇' : person.rank === 2 ? '🥈' : person.rank === 3 ? '🥉' : null;
                const progressPercent = topMessagesSent > 0
                  ? Math.round((person.messages_sent / topMessagesSent) * 100)
                  : 0;
                const initials = person.name
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0]?.toUpperCase() ?? '')
                  .join('') || '?';

                return (
                  <div
                    key={person.employeeId}
                    className={`px-4 py-3 ${!isAdmin && isCurrentUser ? 'bg-blue-50/70' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 text-xs font-semibold text-gray-600 flex-shrink-0">
                        {medal ? `${medal} #${person.rank}` : `#${person.rank}`}
                      </div>

                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-700 flex-shrink-0">
                        {initials}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{person.name}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700">{person.messages_sent} msgs</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700">{person.unique_leads_contacted} leads</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700">{person.green_forms_opened} GF</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gray-900 rounded-full"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}