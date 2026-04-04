// @ts-nocheck
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Inbox, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabaseApi } from '@/api/supabaseService';
import { useCurrentUser } from '@/lib/CurrentUserContext';
import WalkinFollowupCard from './WalkinFollowupCard';
import LogCallModal from './LogCallModal';

const UIButton = /** @type {any} */ (Button);

const SEGMENTS = ['All', 'EV', 'Premium SUV', 'Others'];

export default function WalkinFollowupTab() {
  const queryClient = useQueryClient();
  const { currentUser } = useCurrentUser();
  const [activeSegment, setActiveSegment] = useState('All');
  const [selectedWalkin, setSelectedWalkin] = useState(null);
  const [subTab, setSubTab] = useState('pending');

  const isAdmin = currentUser?.isSuperAdmin || currentUser?.role === 'admin';

  // Fetch queue data
  const { data: queueData = [], isLoading: isLoadingQueue } = useQuery({
    queryKey: ['walkin-followup-queue'],
    queryFn: () => supabaseApi.walkinFollowup.getQueue(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Fetch manager stats (admin only)
  const { data: statsData = null, isLoading: isLoadingStats } = useQuery({
    queryKey: ['walkin-manager-stats'],
    queryFn: () => supabaseApi.walkinFollowup.getManagerStats(),
    enabled: isAdmin,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Log call mutation
  const logCallMutation = useMutation({
    mutationFn: (payload) => supabaseApi.walkinFollowup.logCall({
      ...payload,
      caller_id: currentUser?.authUserId || currentUser?.id,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['walkin-followup-queue'] });
      queryClient.invalidateQueries({ queryKey: ['walkin-manager-stats'] });
      setSelectedWalkin(null);
    },
  });

  // Filter by segment
  const filtered = useMemo(() => {
    if (activeSegment === 'All') {
      return queueData;
    }
    return queueData.filter((walkin) => walkin.model_segment === activeSegment);
  }, [queueData, activeSegment]);

  // Count stats for non-admin view
  const basicStats = useMemo(() => {
    const total = filtered.length;
    const pending = filtered.filter((w) => w.followup_status === 'pending').length;
    const escalated = filtered.filter((w) => w.followup_status === 'escalated').length;
    const booked = filtered.filter((w) => w.followup_status === 'booked').length;
    return { total, pending, escalated, booked };
  }, [filtered]);

  const pendingWalkins = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    return filtered.filter(w => {
      if (w.followup_status === 'booked' || w.followup_status === 'not_interested') return false;
      if (!w.next_call_date) return w.followup_status === 'pending';
      const due = new Date(w.next_call_date); due.setHours(0,0,0,0);
      return due.getTime() <= today.getTime();
    });
  }, [filtered]);

  const handleLogCall = async (payload) => {
    await logCallMutation.mutateAsync(payload);
  };

  const isLoading = isLoadingQueue || isLoadingStats;
  const stats = isAdmin ? statsData : null;

  return (
    <div className="flex flex-col h-full">
      {/* ── Admin stats strip ── */}
      {isAdmin && !isLoading && stats && (
        <div className="grid grid-cols-4 gap-2 px-4 pt-3 pb-2">
          <div className="bg-blue-50 rounded-xl p-2 text-center border border-blue-200">
            <div className="text-sm font-semibold text-blue-900">
              {stats.status_counts?.pending || 0}
            </div>
            <div className="text-[10px] text-gray-500">Pending</div>
          </div>
          <div className={cn(
            'rounded-xl p-2 text-center border',
            (stats.overdue_count || 0) > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'
          )}>
            <div className={cn(
              'text-sm font-semibold',
              (stats.overdue_count || 0) > 0 ? 'text-red-600' : 'text-gray-900'
            )}>
              {stats.overdue_count || 0}
            </div>
            <div className="text-[10px] text-gray-500">Overdue</div>
          </div>
          <div className="bg-purple-50 rounded-xl p-2 text-center border border-purple-200">
            <div className="text-sm font-semibold text-purple-900">
              {stats.status_counts?.escalated || 0}
            </div>
            <div className="text-[10px] text-gray-500">Escalated</div>
          </div>
          <div className="bg-green-50 rounded-xl p-2 text-center border border-green-200">
            <div className="text-sm font-semibold text-green-900">
              {stats.status_counts?.booked || 0}
            </div>
            <div className="text-[10px] text-gray-500">Booked</div>
          </div>
        </div>
      )}

      {/* ── Segment filter pills ── */}
      <div className="px-4 pt-2 pb-2 bg-gray-50/80 backdrop-blur-sm sticky top-0 z-10 space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex flex-wrap gap-1.5 flex-1">
            {SEGMENTS.map((segment) => (
              <button
                key={segment}
                onClick={() => setActiveSegment(segment)}
                className={cn(
                  'text-xs font-semibold px-3 py-1.5 rounded-full border transition-all',
                  activeSegment === segment
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                )}
              >
                {segment}
              </button>
            ))}
          </div>
          <UIButton
            variant="outline"
            size="icon"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['walkin-followup-queue'] })}
            disabled={isLoading}
            className="h-10 w-10 rounded-xl border-gray-200 flex-shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </UIButton>
        </div>
        <div className="text-[11px] text-gray-400 font-medium">
          {filtered.length} walkin{filtered.length !== 1 ? 's' : ''}
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setSubTab('pending')}
            className={cn(
              'flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-all',
              subTab === 'pending' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
            )}
          >
            Pending Today ({pendingWalkins.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('all')}
            className={cn(
              'flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-all',
              subTab === 'all' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
            )}
          >
            All Walk-ins ({filtered.length})
          </button>
        </div>
      </div>

      {/* ── Card list ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-24 pt-2">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 animate-pulse"
              >
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
            <p className="text-sm font-medium">No walkin follow-ups</p>
            <p className="text-xs mt-1">Try adjusting your segment filter</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(subTab === 'pending' ? pendingWalkins : filtered).map((walkin) => (
              <WalkinFollowupCard
                key={walkin.id}
                walkin={walkin}
                onLogCall={() => setSelectedWalkin(walkin)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Log Call Modal ── */}
      {selectedWalkin && (
        <LogCallModal
          open={Boolean(selectedWalkin)}
          walkin={selectedWalkin}
          onClose={() => setSelectedWalkin(null)}
          onSubmit={handleLogCall}
        />
      )}
    </div>
  );
}
