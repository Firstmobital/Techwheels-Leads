import React, { useState, useMemo, useCallback } from 'react';
import { supabaseApi } from '@/api/supabaseService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { CarFront, Sparkles, FileText, Bot } from 'lucide-react';
import TabContent from '../components/sales/TabContent';
import TemplatesSection from '../components/sales/TemplatesSection';
import AILeadCard from '../components/sales/AILeadCard';
import { useAuth } from '@/lib/AuthContext';
import {
  getLeadSourceForType,
  getSourceRecordIdForLead,
  getSentMessageKeyForRow,
  getNextFollowupStep,
} from '@/utils/sentMessageUtils';

const isAdminUser = (user) => {
  if (!user) return false;
  const roleCode = String(user.roleCode || '').trim().toLowerCase();
  const roleName = String(user.roleName || '').trim().toLowerCase();
  const role = String(user.role || '').trim().toLowerCase();
  return roleCode === 'admin' || roleName === 'admin' || role === 'admin';
};

const LEAD_TABS = [
  { id: 'vana', label: 'VNA Next Allocation', icon: CarFront, color: 'bg-amber-500 hover:bg-amber-600', entity: 'VNAStock' },
  { id: 'matchtalk', label: 'Match Stock', icon: Sparkles, color: 'bg-emerald-500 hover:bg-emerald-600', entity: 'MatchedStockCustomer' },
  { id: 'greenforms', label: 'Green Forms', icon: FileText, color: 'bg-blue-500 hover:bg-blue-600', entity: 'GreenFormSubmittedLead' },
  { id: 'ai_leads', label: 'AI Leads', icon: Bot, color: 'bg-purple-500 hover:bg-purple-600', entity: 'AILead' },
];
const ADMIN_TABS = [
  { id: 'templates', label: 'Templates', icon: FileText, color: 'bg-gray-500 hover:bg-gray-600', entity: null },
];

const MESSAGES = {
  vana: (lead) => `Hello ${lead.customer_name},\n\nYour allocation is ready. Please find your details below:\n${lead.chassis_no ? `Chassis No: ${lead.chassis_no}\n` : ''}${lead.colour ? `Colour: ${lead.colour}\n` : ''}${lead.allocation_status ? `Status: ${lead.allocation_status}\n` : ''}\nPlease contact us to proceed.\n\nThank you.`,
  matchtalk: (lead) => `Booking Name: ${lead.customer_name}\nCar Model: ${lead.ppl || ''}\nVariant: ${lead.pl || ''}\nSales Advisor: ${lead.ca_name || ''}\nContact No.: \n\nWe are pleased to inform you that your vehicle is now available for billing and the chassis number has been allotted.\n\nKindly proceed with the billing and RTO formalities at the earliest. As per company policy, we can hold the vehicle for 4 working days only.\n\nIf you are not planning to take delivery within the next 7 days, we kindly request you to inform us and allow us to allocate the vehicle to the next waiting customer.\n\nWe truly appreciate your understanding and look forward to assisting you with the delivery.\n\nThank you.`,
  greenforms: (lead) => `Hello ${lead.customer_name},\n\nThank you for your interest in the ${lead.model_name || lead.car_model || lead.ppl || 'car'}.\n\nOur team would be happy to assist you with details or a test drive.\n\nPlease let us know how we can help.`,
};

/** @typedef {{ lead: any, leadType: string, messageText: string, templateId?: number | null }} MarkSentPayload */

export default function Home() {
  const [activeTab, setActiveTab] = useState('vana');
  const [aiLeadsView, setAiLeadsView] = useState('assigned');
  const { user: currentUser, isLoadingAuth } = useAuth();
  const queryClient = useQueryClient();

  const isAdmin = isAdminUser(currentUser);

  if (isLoadingAuth) {
    return <div>Loading...</div>;
  }

  const { data: vanaLeads = [], isLoading: vanaLoading } = useQuery({
    queryKey: ['vna-stock'],
    queryFn: () => supabaseApi.entities.VNAStock.list('-created_at'),
    enabled: !!currentUser,
  });

  const { data: matchLeads = [], isLoading: matchLoading } = useQuery({
    queryKey: ['match-leads'],
    queryFn: () => supabaseApi.entities.MatchedStockCustomer.list('-stage_3_date'),
    enabled: !!currentUser,
  });

  const { data: greenLeads = [], isLoading: greenLoading } = useQuery({
    queryKey: ['green-leads'],
    queryFn: () => supabaseApi.entities.GreenFormSubmittedLead.list('-created_at'),
    enabled: !!currentUser,
  });

  const { data: aiLeads = [], isLoading: aiLoading } = useQuery({
    queryKey: ['ai-leads'],
    queryFn: () => supabaseApi.entities.AILead.list('-created_at'),
    enabled: !!currentUser,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => supabaseApi.entities.Employee.list(),
    enabled: isAdmin,
  });

  // Filter leads: admin sees all; non-admin visibility depends on tab-specific ownership rules.
  const filterLeads = useCallback((leads, tab) => {
    if (!currentUser) return [];
    if (isAdmin) return leads;
    
    const currentEmployeeId = currentUser.employeeId ?? null;
    const currentUserFullName = currentUser.fullName ?? '';
    
    return leads.filter(l => {
      const leadData = l;
      
      // Try salesperson_id (BigInt) first
      const leadSalespersonId = leadData.salesperson_id ?? null;
      if (leadSalespersonId && currentEmployeeId) {
        return String(leadSalespersonId) === String(currentEmployeeId);
      }

      // Fallback to name-based matching for VNA/Match Stock if salesperson_id is missing
      const leadCaName = leadData.ca_name ?? leadData.employee_full_name ?? '';
      if (leadCaName && currentUserFullName) {
        return leadCaName.toLowerCase() === currentUserFullName.toLowerCase();
      }

      // If no ID or Name match is possible, default to hidden for non-admins
      return false;
    });
  }, [currentUser, isAdmin]);

  const { data: sentMessages = [] } = useQuery({
    queryKey: ['sent-messages'],
    queryFn: () => supabaseApi.entities.SentMessage.list('-created_at'),
  });

  const { data: allTemplates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: () => supabaseApi.entities.Template.list(),
  });

  const sentMessageKeys = useMemo(() => {
    const keys = new Set();
    sentMessages.forEach((row) => {
      const key = getSentMessageKeyForRow(row);
      if (key) keys.add(key);
    });
    return keys;
  }, [sentMessages]);

  const aiSentCountByLeadId = useMemo(() => {
    const counts = new Map();
    sentMessages.forEach((row) => {
      const leadSource = String(row?.lead_source || '').trim().toLowerCase();
      const sourceRecordId = row?.source_record_id;
      if (leadSource !== 'ai' || sourceRecordId === null || sourceRecordId === undefined) {
        return;
      }

      const key = String(sourceRecordId);
      const currentCount = counts.get(key) ?? 0;
      counts.set(key, currentCount + 1);
    });
    return counts;
  }, [sentMessages]);

  /** @type {import('@tanstack/react-query').UseMutationOptions<any, unknown, MarkSentPayload, unknown>} */
  const markSentMutationOptions = {
    mutationFn: ({ lead, leadType, messageText, templateId }) => {
      const leadSource = getLeadSourceForType(lead, leadType);
      const sourceRecordId = getSourceRecordIdForLead(lead, leadType);

      return supabaseApi.entities.SentMessage.create({
      customer_name: lead?.customer_name || null,
      mobile_number: lead?.mobile_number || lead?.phone_number || '',
      message_text: messageText || null,
      template_id: templateId ?? null,
      lead_source: leadSource,
      source_record_id: sourceRecordId,
      sent_by_employee_id: currentUser?.employeeId ?? null,
      sent_via: 'whatsapp_link',
      status: 'sent',
      });
    },
    onMutate: ({ lead, leadType, messageText, templateId }) => {
      const leadSource = getLeadSourceForType(lead, leadType);
      const sourceRecordId = getSourceRecordIdForLead(lead, leadType);
      queryClient.setQueryData(['sent-messages'], (old = []) => {
        const safeOld = Array.isArray(old) ? old : [];
        const newMsg = {
          customer_name: lead?.customer_name || null,
          mobile_number: lead?.mobile_number || lead?.phone_number || '',
          message_text: messageText || null,
          template_id: templateId ?? null,
          lead_source: leadSource,
          source_record_id: sourceRecordId,
          sent_by_employee_id: currentUser?.employeeId ?? null,
          sent_via: 'whatsapp_link',
          status: 'sent',
          created_at: new Date().toISOString(),
        };
        return [...safeOld, newMsg];
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sent-messages'] }),
    onError: () => queryClient.invalidateQueries({ queryKey: ['sent-messages'] }),
  };

  const markSentMutation = useMutation(markSentMutationOptions);

  const handleMarkSent = useCallback((payload) => {
    markSentMutation.mutate(payload);
  }, [markSentMutation]);

  const handleRefresh = useCallback((key) => {
    queryClient.invalidateQueries({ queryKey: [key] });
  }, [queryClient]);

  // Filter AI leads: admin sees all, CA sees unassigned + their own
  const filteredAILeads = useMemo(() => {
    if (!currentUser) return [];
    const currentEmployeeId = currentUser.employeeId ?? null;
    if (isAdmin) return aiLeads;
    return aiLeads.filter((lead) => {
      const salespersonId = lead.salesperson_id ?? null;
      const isUnassigned = salespersonId === null || salespersonId === undefined || salespersonId === '';
      if (isUnassigned) return true;
      if (currentEmployeeId === null || currentEmployeeId === undefined) return false;
      return String(salespersonId) === String(currentEmployeeId);
    });
  }, [aiLeads, currentUser, isAdmin]);

  const aiLeadSections = useMemo(() => {
    const unassigned = [];
    const assigned = [];

    filteredAILeads.forEach((lead) => {
      const salespersonId = lead?.salesperson_id ?? null;
      const isUnassigned = salespersonId === null || salespersonId === undefined || salespersonId === '';
      if (isUnassigned) {
        unassigned.push(lead);
        return;
      }

      assigned.push(lead);
    });

    const followUpPendingToday = [];
    const followUpNotPending = [];

    assigned.forEach((lead) => {
      const followup = getNextFollowupStep(lead, sentMessages);
      const hasAssignedAt = Boolean(lead?.assigned_at);
      const isPendingNow = hasAssignedAt && followup.nextStep !== null && !followup.isCompleted && followup.isDueNow;

      if (isPendingNow) {
        followUpPendingToday.push(lead);
      } else {
        followUpNotPending.push(lead);
      }
    });

    return {
      unassigned,
      assigned,
      followUpPendingToday,
      followUpNotPending,
    };
  }, [filteredAILeads, sentMessages]);

  const tabData = {
    vana: { leads: filterLeads(vanaLeads, 'vana'), loading: vanaLoading, refreshKey: 'vna-stock' },
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
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Dealership Leads</h1>
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
              <>
                <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-1 flex gap-1">
                  <button
                    type="button"
                    onClick={() => setAiLeadsView('assigned')}
                    className={cn(
                      'flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-all',
                      aiLeadsView === 'assigned'
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-500 hover:bg-gray-100'
                    )}
                  >
                    Assigned ({aiLeadSections.assigned.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAiLeadsView('unassigned')}
                    className={cn(
                      'flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-all',
                      aiLeadsView === 'unassigned'
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-500 hover:bg-gray-100'
                    )}
                  >
                    Unassigned ({aiLeadSections.unassigned.length})
                  </button>
                </div>

                {aiLeadsView === 'unassigned' ? (
                  aiLeadSections.unassigned.length === 0 ? (
                    <div className="text-center py-16 text-gray-400 text-sm">No unassigned AI leads</div>
                  ) : (
                    aiLeadSections.unassigned.map((lead) => (
                      <AILeadCard
                        key={lead.id}
                        lead={lead}
                        currentUser={currentUser}
                        isAdmin={isAdmin}
                        mode="unassigned"
                        templates={allTemplates}
                        onMarkSent={handleMarkSent}
                        sentMessages={sentMessages}
                        sentCount={aiSentCountByLeadId.get(String(lead?.id ?? '')) ?? 0}
                      />
                    ))
                  )
                ) : (
                  <div className="space-y-4">
                    <section>
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Follow-up Pending Today</h3>
                        <span className="text-[11px] text-gray-400">{aiLeadSections.followUpPendingToday.length}</span>
                      </div>
                      {aiLeadSections.followUpPendingToday.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-4 text-xs text-gray-400">
                          No assigned leads pending follow-up
                        </div>
                      ) : (
                        aiLeadSections.followUpPendingToday.map((lead) => (
                          <AILeadCard
                            key={lead.id}
                            lead={lead}
                            currentUser={currentUser}
                            isAdmin={isAdmin}
                            mode="assigned"
                            templates={allTemplates}
                            onMarkSent={handleMarkSent}
                            sentMessages={sentMessages}
                            sentCount={aiSentCountByLeadId.get(String(lead?.id ?? '')) ?? 0}
                          />
                        ))
                      )}
                    </section>

                    <section>
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Follow-up Not Pending</h3>
                        <span className="text-[11px] text-gray-400">{aiLeadSections.followUpNotPending.length}</span>
                      </div>
                      {aiLeadSections.followUpNotPending.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-4 text-xs text-gray-400">
                          No assigned leads in not-pending state
                        </div>
                      ) : (
                        aiLeadSections.followUpNotPending.map((lead) => (
                          <AILeadCard
                            key={lead.id}
                            lead={lead}
                            currentUser={currentUser}
                            isAdmin={isAdmin}
                            mode="assigned"
                            templates={allTemplates}
                            onMarkSent={handleMarkSent}
                            sentMessages={sentMessages}
                            sentCount={aiSentCountByLeadId.get(String(lead?.id ?? '')) ?? 0}
                          />
                        ))
                      )}
                    </section>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <TabContent
            leads={current.leads}
            isLoading={current.loading}
            tab={activeTab}
            accentColor={currentTab.color}
            getMessage={MESSAGES[activeTab]}
            sentMessageKeys={sentMessageKeys}
            sentMessages={sentMessages}
            onMarkSent={handleMarkSent}
            onRefresh={() => handleRefresh(current.refreshKey)}
            templates={allTemplates}
            isAdmin={isAdmin}
            users={users}
          />
        )}
      </div>
    </div>
  );
}