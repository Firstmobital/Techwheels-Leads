import React, { useMemo } from 'react';
import { supabaseApi } from '@/api/supabaseService';
import { useQuery } from '@tanstack/react-query';
import { BarChart2, CheckCircle2, RefreshCw, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';

const SUCCESS_STATUSES = new Set(['sent']);

const isAdminUser = (user) => {
  if (!user) return false;
  const roleCode = String(user.roleCode || '').trim().toLowerCase();
  const roleName = String(user.roleName || '').trim().toLowerCase();
  const role = String(user.role || '').trim().toLowerCase();
  return roleCode === 'admin' || roleName === 'admin' || role === 'admin';
};

// Templates moved to Home dashboard
export default function Report() {
  const today = new Date().toISOString().split('T')[0];
  const { user: currentUser } = useAuth();

  const isAdmin = isAdminUser(currentUser);

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => supabaseApi.entities.Employee.list(),
    enabled: isAdmin,
  });

  const { data: sentMessages = [], isLoading, refetch } = useQuery({
    queryKey: ['sent-messages-report'],
    queryFn: () => supabaseApi.entities.SentMessage.list('-sent_at'),
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

  const filteredMessages = useMemo(() => {
    if (!currentUser) return [];
    if (isAdmin) return sentMessages;
    return sentMessages.filter(m => m.sent_by === currentUser.email);
  }, [sentMessages, currentUser, isAdmin]);

  // Group key: sent_by + date(sent_at)
  const groupedBySenderAndDate = useMemo(() => {
    const grouped = {};

    filteredMessages.forEach((m) => {
      if (!m.sent_at || !m.sent_by) return;
      const sentDate = m.sent_at.split('T')[0];
      if (!sentDate) return;

      const key = `${m.sent_by}::${sentDate}`;
      if (!grouped[key]) {
        grouped[key] = {
          sent_by: m.sent_by,
          sent_date: sentDate,
          total_messages: 0,
          successful_messages: 0,
          tabs: {},
        };
      }

      grouped[key].total_messages += 1;
      if (SUCCESS_STATUSES.has((m.status ?? 'sent').toLowerCase())) {
        grouped[key].successful_messages += 1;
      }

      if (m.tab) {
        grouped[key].tabs[m.tab] = (grouped[key].tabs[m.tab] || 0) + 1;
      }
    });

    return Object.values(grouped);
  }, [filteredMessages]);

  const todayGrouped = useMemo(() => {
    return groupedBySenderAndDate.filter(g => g.sent_date === today);
  }, [groupedBySenderAndDate, today]);

  const messagesPerUser = useMemo(() => {
    const map = {};
    todayGrouped.forEach((g) => {
      if (!map[g.sent_by]) {
        map[g.sent_by] = {
          sent_by: g.sent_by,
          total_messages: 0,
          successful_messages: 0,
          tabs: {},
        };
      }

      map[g.sent_by].total_messages += g.total_messages;
      map[g.sent_by].successful_messages += g.successful_messages;
      Object.entries(g.tabs).forEach(([tab, count]) => {
        map[g.sent_by].tabs[tab] = (map[g.sent_by].tabs[tab] || 0) + Number(count || 0);
      });
    });

    users.filter(u => u.role === 'user').forEach(u => {
      if (!map[u.email]) {
        map[u.email] = {
          sent_by: u.email,
          total_messages: 0,
          successful_messages: 0,
          tabs: {},
        };
      }
    });

    return Object.entries(map)
      .map(([email, data]) => {
        const user = users.find(u => u.email === email);
        return {
          email,
          name: user?.full_name ?? email,
          total_messages: data.total_messages,
          successful_messages: data.successful_messages,
          success_rate: data.total_messages > 0
            ? Math.round((data.successful_messages / data.total_messages) * 100)
            : 0,
          tabs: data.tabs,
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
    const headers = ['Sent At', 'Tab', 'Day Step', 'Sent By', 'Status', 'CA Name', 'Lead ID'];
    const rows = filteredMessages.map(m => [
      m.sent_at ? new Date(m.sent_at).toLocaleString('en-IN') : '',
      m.tab || '',
      m.day_step || 1,
      m.sent_by || '',
      m.status ?? 'sent',
      m.ca_name || '',
      m.lead_id || '',
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
  const totalPending = Math.max(0, totalLeads - new Set(filteredMessages.map(m => m.lead_id)).size);

  const tabColors = {
    vana: 'bg-amber-100 text-amber-700',
    matchtalk: 'bg-emerald-100 text-emerald-700',
    greenforms: 'bg-blue-100 text-blue-700',
  };
  const tabLabels = { vana: 'VANA', matchtalk: 'MatchTalk', greenforms: 'Green' };

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
        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
            <p className="text-2xl font-bold text-gray-900">{totalLeads}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Total Leads</p>
          </div>
          <div className="bg-emerald-50 rounded-2xl p-3 shadow-sm border border-emerald-100 text-center">
            <p className="text-2xl font-bold text-emerald-700">{totalContacted}</p>
            <p className="text-[11px] text-emerald-500 mt-0.5">Messages Sent Today</p>
          </div>
          <div className="bg-amber-50 rounded-2xl p-3 shadow-sm border border-amber-100 text-center">
            <p className="text-2xl font-bold text-amber-700">{successRate}%</p>
            <p className="text-[11px] text-amber-500 mt-0.5">Success Rate</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 text-center">
          <p className="text-sm text-gray-500">Pending Leads: <span className="font-semibold text-gray-900">{totalPending}</span></p>
        </div>

        {/* Per Salesperson */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-gray-500" />
            <h2 className="font-semibold text-sm text-gray-800">Salesperson Performance Today</h2>
          </div>

          {messagesPerUser.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">No activity yet today</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {messagesPerUser.map((person) => (
                <div key={person.email} className="px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">
                    {person.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{person.name}</p>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {Object.entries(person.tabs).map(([tab, count]) => (
                        <span key={tab} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${tabColors[tab] || 'bg-gray-100 text-gray-600'}`}>
                          {tabLabels[tab] || tab}: {count}
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

        {/* Tab breakdown for today */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="font-semibold text-sm text-gray-800">Today's Breakdown by Tab</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {['vana', 'matchtalk', 'greenforms'].map(tab => {
              const count = filteredMessages
                .filter(m => m.sent_at && m.sent_at.split('T')[0] === today && m.tab === tab)
                .length;
              const total = { vana: vanaLeads.length, matchtalk: matchLeads.length, greenforms: greenLeads.length }[tab];
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={tab} className="px-4 py-3">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm font-medium text-gray-700">{tabLabels[tab]}</span>
                    <span className="text-xs text-gray-500">{count} / {total}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${tab === 'vana' ? 'bg-amber-400' : tab === 'matchtalk' ? 'bg-emerald-400' : 'bg-blue-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">{pct}% contacted today</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}