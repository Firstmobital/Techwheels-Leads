import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, RefreshCw, Inbox } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem } from "@/components/ui/select";
import MobileSelect from '@/components/shared/MobileSelect';
import { getSentMessageKeyForLead } from '@/utils/sentMessageUtils';

import LeadCard from './LeadCard';

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
  const scrollRef = useRef(null);
  const startTouchRef = useRef(null);
  const scrollPositionsRef = useRef({});

  const carModels = useMemo(() => {
    const models = new Set();
    if (tab === 'matchtalk') {
      leads.forEach(l => {
        const leadData = l;
        leadData.ppl && models.add(leadData.ppl);
      });
    } else if (tab === 'vana') {
      leads.forEach(l => {
        const leadData = l;
        const model = leadData.car_model || leadData.ppl;
        model && models.add(model);
      });
    } else if (tab === 'greenforms') {
      leads.forEach(l => {
        const leadData = l;
        const model = leadData.model_name || leadData.car_model || leadData.ppl;
        model && models.add(model);
      });
    } else {
      leads.forEach(l => {
        const leadData = l;
        leadData.car_model && models.add(leadData.car_model);
      });
    }
    return [...models].sort();
  }, [leads, tab]);

  const pplOptions = useMemo(() => {
    if (tab !== 'greenforms') return [];
    const vals = new Set();
    leads.forEach(l => {
      const leadData = l;
      const model = leadData.model_name || leadData.car_model || leadData.ppl;
      model && vals.add(model);
    });
    return [...vals].sort();
  }, [leads, tab]);

  const sourceOptions = useMemo(() => {
    if (tab !== 'greenforms') return [];
    const vals = new Set();
    leads.forEach(l => {
      const leadData = l;
      const source = leadData.source_type || leadData.source_pv;
      source && vals.add(source);
    });
    return [...vals].sort();
  }, [leads, tab]);

  const branchOptions = useMemo(() => {
    if (tab === 'greenforms') return [];
    const vals = new Set();
    leads.forEach(l => {
      const leadData = l;
      leadData.branch && vals.add(leadData.branch);
    });
    return [...vals].sort();
  }, [leads, tab]);

  const caOptions = useMemo(() => {
    const vals = new Set();
    leads.forEach(l => {
      const leadData = l;
      leadData.ca_name && vals.add(leadData.ca_name);
    });
    return [...vals].sort();
  }, [leads]);

  const filtered = useMemo(() => {
    return leads.filter(lead => {
      const leadData = lead;
      const resolvedPhone = leadData.mobile_number || leadData.phone_number || '';
      const resolvedVnaModel = leadData.car_model || leadData.ppl || '';
      const resolvedVnaAllocation = String(leadData.allocation_status || leadData.status || '').trim().toLowerCase();
      const resolvedGreenFormModel = leadData.model_name || leadData.car_model || leadData.ppl;
      const resolvedGreenFormSource = leadData.source_type || leadData.source_pv || '';
      const matchSearch = !search || 
        leadData.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
        String(resolvedPhone).includes(search);
      const matchCar = carFilter === 'all' || (tab === 'matchtalk'
        ? leadData.ppl === carFilter
        : tab === 'vana'
          ? resolvedVnaModel === carFilter
        : tab === 'greenforms'
          ? resolvedGreenFormModel === carFilter
          : leadData.car_model === carFilter);
      const leadSentKey = getSentMessageKeyForLead(leadData, tab);
      const isLeadSent = leadSentKey ? sentMessageKeys.has(leadSentKey) : false;
      const matchSent = showSent || !isLeadSent;
      const matchPerson = personFilter === 'all' || (tab === 'greenforms' ? leadData.salesperson_id === personFilter : leadData.ca_name === personFilter);
      const matchAllocation = allocationFilter === 'all' || (tab === 'vana' && resolvedVnaAllocation === 'next in allocation');
      const matchPpl = pplFilter === 'all' || resolvedGreenFormModel === pplFilter;
      const matchSource = sourceFilter === 'all' || resolvedGreenFormSource === sourceFilter;
      const matchBranch = branchFilter === 'all' || leadData.branch === branchFilter;
      return matchSearch && matchCar && matchSent && matchPerson && matchAllocation && matchPpl && matchSource && matchBranch;
    });
  }, [leads, search, carFilter, showSent, sentMessageKeys, personFilter, allocationFilter, pplFilter, sourceFilter, branchFilter, tab]);

  // Save scroll position when tab changes
  useEffect(() => {
    return () => {
      if (scrollRef.current) {
        scrollPositionsRef.current[tab] = scrollRef.current.scrollTop;
      }
    };
  }, [tab]);

  // Restore scroll position when tab re-enters
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

  return (
    <div className="flex flex-col h-full dark:bg-gray-900">
      {/* Search & Filters */}
      <div className="px-4 pt-3 pb-2 space-y-2 bg-gray-50/80 dark:bg-gray-800/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-xl bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-sm dark:text-white"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={onRefresh}
            disabled={isLoading}
            className="h-10 w-10 rounded-xl border-gray-200"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {carModels.length > 0 && (
            <MobileSelect value={carFilter} onValueChange={setCarFilter} placeholder={tab === 'matchtalk' ? 'PPL' : 'Models'} className="flex-1">
              <SelectItem value="all">{tab === 'matchtalk' ? 'All PPL' : 'All'}</SelectItem>
              {carModels.map(m => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </MobileSelect>
          )}
          {isAdmin && caOptions.length > 0 && (tab === 'matchtalk' || tab === 'vana') && (
            <MobileSelect value={personFilter} onValueChange={setPersonFilter} placeholder="CA Name" className="flex-1">
              <SelectItem value="all">All CA Name</SelectItem>
              {caOptions.map(ca => (
                <SelectItem key={ca} value={ca}>{ca}</SelectItem>
              ))}
            </MobileSelect>
          )}
          {tab === 'greenforms' && pplOptions.length > 0 && (
            <MobileSelect value={pplFilter} onValueChange={setPplFilter} placeholder="PPL" className="flex-1">
              <SelectItem value="all">All PPL</SelectItem>
              {pplOptions.map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </MobileSelect>
          )}
          {tab === 'greenforms' && sourceOptions.length > 0 && (
            <MobileSelect value={sourceFilter} onValueChange={setSourceFilter} placeholder="Source" className="flex-1">
              <SelectItem value="all">All Source</SelectItem>
              {sourceOptions.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </MobileSelect>
          )}
          {tab !== 'greenforms' && branchOptions.length > 0 && (
            <MobileSelect value={branchFilter} onValueChange={setBranchFilter} placeholder="Branch" className="flex-1">
              <SelectItem value="all">All Branch</SelectItem>
              {branchOptions.map(b => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </MobileSelect>
          )}
          {tab === 'vana' && (
            <Button
              variant={allocationFilter === 'Next In Allocation' ? "default" : "outline"}
              size="sm"
              onClick={() => setAllocationFilter(allocationFilter === 'Next In Allocation' ? 'all' : 'Next In Allocation')}
              className="h-8 rounded-lg text-xs px-3"
            >
              Next In Allocation
            </Button>
          )}
          <Button
            variant={showSent ? "default" : "outline"}
            size="sm"
            onClick={() => setShowSent(!showSent)}
            className="h-8 rounded-lg text-xs px-3"
          >
            {showSent ? 'Hide sent' : 'Show sent'}
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-gray-400 font-medium">
            {filtered.length} lead{filtered.length !== 1 ? 's' : ''} 
            {sentMessageKeys.size > 0 && ` · ${sentMessageKeys.size} sent`}
          </div>
        </div>
      </div>

      {/* Lead list */}
      <div 
       ref={scrollRef}
       className="flex-1 overflow-y-auto px-4 pb-24 pt-2 dark:bg-gray-900"
       onTouchStart={(e) => {
         startTouchRef.current = e.touches?.[0]?.clientY || null;
       }}
       onTouchMove={handlePullToRefresh}
       onTouchEnd={() => {
         startTouchRef.current = null;
       }}
      >
       {isPulling && (
         <div className="flex justify-center py-4">
           <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 dark:border-gray-600 border-t-gray-900 dark:border-t-white"></div>
         </div>
       )}
        {isLoading ? (
          <div className="space-y-3">
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
              return (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  tab={tab}
                  accentColor={accentColor}
                  message={getMessage(lead)}
                  isSent={isLeadSent}
                  sentMessages={sentMessages}
                  onMarkSent={onMarkSent}
                  templates={templates}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}