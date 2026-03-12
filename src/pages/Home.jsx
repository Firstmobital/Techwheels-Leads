import React, { useState, useMemo, useCallback } from 'react';
import { supabaseApi } from '@/api/supabaseService';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { CarFront, Sparkles, FileText, RefreshCw, Bot } from 'lucide-react';
import TabContent from '../components/sales/TabContent';
import TemplatesSection from '../components/sales/TemplatesSection';
import AILeadCard from '../components/sales/AILeadCard';
import { useAuth } from '@/lib/AuthContext';

const LEAD_TABS = [
  { id: 'vana', label: 'VNA Next Allocation', icon: CarFront, color: 'bg-amber-500 hover:bg-amber-600', entity: 'VanaLead' },
  { id: 'matchtalk', label: 'Match Stock', icon: Sparkles, color: 'bg-emerald-500 hover:bg-emerald-600', entity: 'MatchTalkLead' },
  { id: 'greenforms', label: 'Green Forms', icon: FileText, color: 'bg-blue-500 hover:bg-blue-600', entity: 'GreenFormLead' },
  { id: 'ai_leads', label: 'AI Leads', icon: Bot, color: 'bg-purple-500 hover:bg-purple-600', entity: 'AIGeneratedLead' },
];
const ADMIN_TABS = [
  { id: 'templates', label: 'Templates', icon: FileText, color: 'bg-gray-500 hover:bg-gray-600', entity: null },
];

const MESSAGES = {
  vana: (lead) => `Hello ${lead.customer_name},\n\nYour allocation is ready. Please find your details below:\n${lead.chassis_no ? `Chassis No: ${lead.chassis_no}\n` : ''}${lead.colour ? `Colour: ${lead.colour}\n` : ''}${lead.allocation_status ? `Status: ${lead.allocation_status}\n` : ''}\nPlease contact us to proceed.\n\nThank you.`,
  matchtalk: (lead) => `Booking Name: ${lead.customer_name}\nCar Model: ${lead.ppl || ''}\nVariant: ${lead.pl || ''}\nSales Advisor: ${lead.ca_name || ''}\nContact No.: \n\nWe are pleased to inform you that your vehicle is now available for billing and the chassis number has been allotted.\n\nKindly proceed with the billing and RTO formalities at the earliest. As per company policy, we can hold the vehicle for 4 working days only.\n\nIf you are not planning to take delivery within the next 7 days, we kindly request you to inform us and allow us to allocate the vehicle to the next waiting customer.\n\nWe truly appreciate your understanding and look forward to assisting you with the delivery.\n\nThank you.`,
  greenforms: (lead) => `Hello ${lead.customer_name},\n\nThank you for your interest in the ${lead.car_model || 'car'}.\n\nOur team would be happy to assist you with details or a test drive.\n\nPlease let us know how we can help.`,
};

/** @typedef {{ leadId: string, tab: string, dayStep?: number, caName?: string }} MarkSentPayload */

export default function Home() {
  const [activeTab, setActiveTab] = useState('vana');
  const { user: currentUser, isLoadingAuth } = useAuth();
  const queryClient = useQueryClient();

  const isAdmin = currentUser?.role === 'admin';

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [syncingAI, setSyncingAI] = useState(false);
  const [syncAIMsg, setSyncAIMsg] = useState('');

  if (isLoadingAuth) {
    return <div>Loading...</div>;
  }

  const handleSyncAll = async () => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('User not authenticated yet');
      }
      const results = await Promise.all(
        ['VanaLead', 'MatchTalkLead', 'GreenFormLead'].map(entity =>
          supabase.functions
            .invoke('syncFromSheets', {
              body: { entity },
            })
            .then(({ data, error }) => {
              if (error) throw error;
              return data ?? {};
            })
            .catch(e => ({ error: e.message, rows_inserted: 0, rows_updated: 0, rows_processed: 0, rows_skipped: 0 }))
        )
      );
      const totalInserted = results.reduce((s, d) => s + Number(d?.rows_inserted || 0), 0);
      const totalUpdated = results.reduce((s, d) => s + Number(d?.rows_updated || 0), 0);
      const totalProcessed = results.reduce((s, d) => s + Number(d?.rows_processed || 0), 0);
      const totalSkipped = results.reduce((s, d) => s + Number(d?.rows_skipped || 0), 0);
      const errors = results.filter(d => d.error);
      const summary = `Inserted: ${totalInserted} · Updated: ${totalUpdated} · Processed: ${totalProcessed} · Skipped: ${totalSkipped}`;
      setSyncMsg(errors.length ? `⚠ ${summary} · ${errors.length} failed` : `✓ ${summary}`);
      queryClient.invalidateQueries({ queryKey: ['vana-leads'] });
      queryClient.invalidateQueries({ queryKey: ['match-leads'] });
      queryClient.invalidateQueries({ queryKey: ['green-leads'] });
    } catch (e) {
      setSyncMsg('Failed: ' + e.message);
    }
    setSyncing(false);
  };

  const handleSyncAILeads = async () => {
    setSyncingAI(true);
    setSyncAIMsg('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('syncAIGeneratedLeads', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: {},
      });
      if (error) throw error;
      const result = data ?? {};
      setSyncAIMsg(
        result.error
          ? `⚠ ${result.error}`
          : `✓ Inserted: ${Number(result?.rows_inserted || 0)} · Updated: ${Number(result?.rows_updated || 0)} · Processed: ${Number(result?.rows_processed || 0)} · Skipped: ${Number(result?.rows_skipped || 0)}`
      );
      queryClient.invalidateQueries({ queryKey: ['ai-leads'] });
    } catch (e) {
      const msg = e?.response?.data?.error || e.message;
      setSyncAIMsg('⚠ ' + msg);
    }
    setSyncingAI(false);
  };

  const { data: vanaLeads = [], isLoading: vanaLoading } = useQuery({
    queryKey: ['vana-leads'],
    queryFn: () => supabaseApi.entities.VanaLead.list('-created_date'),
    enabled: !!currentUser,
  });

  const { data: matchLeads = [], isLoading: matchLoading } = useQuery({
    queryKey: ['match-leads'],
    queryFn: () => supabaseApi.entities.MatchTalkLead.list('-created_date'),
    enabled: !!currentUser,
  });

  const { data: greenLeads = [], isLoading: greenLoading } = useQuery({
    queryKey: ['green-leads'],
    queryFn: () => supabaseApi.entities.GreenFormLead.list('-created_date'),
    enabled: !!currentUser,
  });

  const { data: aiLeads = [], isLoading: aiLoading } = useQuery({
    queryKey: ['ai-leads'],
    queryFn: () => supabaseApi.entities.AIGeneratedLead.list('-created_date'),
    enabled: !!currentUser,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => supabaseApi.entities.User.list(),
    enabled: isAdmin,
  });

  // Filter leads: regular user sees only their assigned CA names leads; admin sees all
  const filterLeads = useCallback((leads, tab) => {
    if (!currentUser) return [];
    if (isAdmin) return leads;
    
    const userCaNames = currentUser.ca_names || [];
    if (!Array.isArray(userCaNames) || userCaNames.length === 0) return [];
    
    return leads.filter(l => {
      const leadData = l;
      if (tab === 'greenforms') {
        return userCaNames.includes(leadData.employee_full_name);
      } else {
        return userCaNames.includes(leadData.ca_name);
      }
    });
  }, [currentUser, isAdmin]);

  const { data: sentMessages = [] } = useQuery({
    queryKey: ['sent-messages'],
    queryFn: () => supabaseApi.entities.SentMessage.list(),
  });

  const { data: allTemplates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: () => supabaseApi.entities.Template.list(),
  });

  const sentByTab = useMemo(() => {
    const map = { vana: new Set(), matchtalk: new Set(), greenforms: new Set() };
    sentMessages.forEach(m => {
      if (map[m.tab]) map[m.tab].add(m.lead_id);
    });
    return map;
  }, [sentMessages]);

  /** @type {import('@tanstack/react-query').UseMutationOptions<any, unknown, MarkSentPayload, unknown>} */
  const markSentMutationOptions = {
    mutationFn: ({ leadId, tab, dayStep, caName }) => supabaseApi.entities.SentMessage.create({
      lead_id: leadId,
      tab: tab,
      day_step: dayStep || 1,
      sent_at: new Date().toISOString(),
      sent_by: currentUser?.email || '',
      status: 'sent',
      ca_name: caName || '',
    }),
    onMutate: ({ leadId, tab }) => {
      queryClient.setQueryData(['sent-messages'], (old = []) => {
        const safeOld = Array.isArray(old) ? old : [];
        const newMsg = { lead_id: leadId, tab: tab, sent_at: new Date().toISOString(), status: 'sent' };
        return [...safeOld, newMsg];
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sent-messages'] }),
    onError: () => queryClient.invalidateQueries({ queryKey: ['sent-messages'] }),
  };

  const markSentMutation = useMutation(markSentMutationOptions);

  const handleMarkSent = useCallback((leadId, tab, dayStep, caName) => {
    markSentMutation.mutate({ leadId, tab, dayStep, caName });
  }, [markSentMutation]);

  const handleRefresh = useCallback((key) => {
    queryClient.invalidateQueries({ queryKey: [key] });
  }, [queryClient]);

  // Filter AI leads: admin sees all, CA sees unassigned + their own
  const filteredAILeads = useMemo(() => {
    if (!currentUser) return [];
    if (isAdmin) return aiLeads;
    return aiLeads.filter(l => !l.is_assigned || l.assigned_to === currentUser.email);
  }, [aiLeads, currentUser, isAdmin]);

  const tabData = {
    vana: { leads: filterLeads(vanaLeads, 'vana'), loading: vanaLoading, refreshKey: 'vana-leads' },
    matchtalk: { leads: filterLeads(matchLeads, 'matchtalk'), loading: matchLoading, refreshKey: 'match-leads' },
    greenforms: { leads: filterLeads(greenLeads, 'greenforms'), loading: greenLoading, refreshKey: 'green-leads' },
    ai_leads: { leads: filteredAILeads, loading: aiLoading, refreshKey: 'ai-leads' },
  };

  const TABS = [...LEAD_TABS, ...(isAdmin ? ADMIN_TABS : [])];
  const currentTab = TABS.find(t => t.id === activeTab);
  const current = tabData[activeTab];
  const isTemplatesTab = activeTab === 'templates';
  const isAILeadsTab = activeTab === 'ai_leads';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-5 pt-6 pb-4 safe-area-top">
        <div className="flex items-center justify-between">
          {isAdmin && (
            <div className="flex items-center gap-2">
              {(syncMsg || syncAIMsg) && (
                <span className="text-xs text-green-600 dark:text-green-400">{syncAIMsg || syncMsg}</span>
              )}
              <button
                onClick={handleSyncAILeads}
                disabled={syncingAI}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 font-medium"
              >
                <Bot className={`w-3 h-3 ${syncingAI ? 'animate-spin' : ''}`} />
                {syncingAI ? 'Syncing...' : 'Sync AI'}
              </button>
              <button
                onClick={handleSyncAll}
                disabled={syncing}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-700 text-white disabled:opacity-50 font-medium"
              >
                <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync All'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-4 flex gap-1 py-2">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const count = tabData[tab.id]?.leads?.length ?? null;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl transition-all text-xs font-medium",
                isActive
                  ? "bg-gray-900 dark:bg-gray-700 text-white shadow-lg shadow-gray-900/20"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {count !== null && count > 0 && (
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-semibold leading-none",
                  isActive ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isTemplatesTab ? (
          <TemplatesSection />
        ) : isAILeadsTab ? (
          <div className="h-full overflow-y-auto p-4 pb-24">
            {current.loading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
              </div>
            ) : current.leads.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">No AI leads available</div>
            ) : (
              current.leads.map(lead => (
                <AILeadCard key={lead.id} lead={lead} currentUser={currentUser} isAdmin={isAdmin} />
              ))
            )}
          </div>
        ) : (
          <TabContent
            leads={current.leads}
            isLoading={current.loading}
            tab={activeTab}
            accentColor={currentTab.color}
            getMessage={MESSAGES[activeTab]}
            sentIds={sentByTab[activeTab]}
            sentMessages={sentMessages}
            onMarkSent={handleMarkSent}
            onRefresh={() => handleRefresh(current.refreshKey)}
            templates={allTemplates.filter(t => t.tab === activeTab || t.tab === 'all')}
            isAdmin={isAdmin}
            users={users}
          />
        )}
      </div>
    </div>
  );
}