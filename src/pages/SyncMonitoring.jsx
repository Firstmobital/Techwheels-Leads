import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Play, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

const isAdminUser = (user) => {
  if (!user) return false;
  const roleCode = String(user.roleCode || '').trim().toLowerCase();
  const roleName = String(user.roleName || '').trim().toLowerCase();
  const role = String(user.role || '').trim().toLowerCase();
  return roleCode === 'admin' || roleName === 'admin' || role === 'admin';
};

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-IN');
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function SyncMonitoring() {
  const { user: currentUser, isLoadingAuth } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = isAdminUser(currentUser);

  const {
    data: logs = [],
    isLoading,
    isFetching,
    refetch,
    error,
  } = useQuery({
    queryKey: ['sync-logs'],
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from('sync_logs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(50);

      if (queryError) throw queryError;
      return data ?? [];
    },
    enabled: !!currentUser && isAdmin,
  });

  const safeLogs = Array.isArray(logs) ? logs : [];

  const runSyncMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('User not authenticated yet');
      }
      const { data, error: invokeError } = await supabase.functions.invoke("syncFromSheets", {
        body: {},
      });
      if (invokeError) throw invokeError;
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sync-logs'] });
    },
  });

  if (isLoadingAuth) {
    return <div>Loading...</div>;
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-6 text-sm text-gray-500">Please sign in.</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white border border-red-100 rounded-2xl p-6 text-sm text-red-600">Unauthorized</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-7xl mx-auto">
      <div className="bg-white border-b border-gray-100 px-5 pt-6 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Sync Monitoring</h1>
            <p className="text-xs text-gray-400 mt-0.5">Last 50 sync runs from sync_logs</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              disabled={isFetching || runSyncMutation.isPending}
              className="inline-flex items-center rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => runSyncMutation.mutate()}
              disabled={runSyncMutation.isPending || isFetching}
              className="inline-flex items-center rounded-xl bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              <Play className={`w-4 h-4 mr-1.5 ${runSyncMutation.isPending ? 'animate-pulse' : ''}`} />
              Run Sync Now
            </button>
          </div>
        </div>

        {runSyncMutation.isError && (
          <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {runSyncMutation.error?.message || 'Failed to run sync.'}
          </div>
        )}

        {runSyncMutation.isSuccess && (
          <div className="mt-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
            Sync triggered successfully.
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="p-6 text-sm text-gray-500">Loading sync logs...</div>
          ) : error ? (
            <div className="p-6 text-sm text-red-600">{error.message || 'Failed to load sync logs.'}</div>
          ) : safeLogs.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">No sync logs found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr className="text-left text-gray-600">
                    <th className="px-3 py-2 font-semibold">Entity</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Processed</th>
                    <th className="px-3 py-2 font-semibold">Inserted</th>
                    <th className="px-3 py-2 font-semibold">Updated</th>
                    <th className="px-3 py-2 font-semibold">Skipped</th>
                    <th className="px-3 py-2 font-semibold">Duration (ms)</th>
                    <th className="px-3 py-2 font-semibold">Started</th>
                    <th className="px-3 py-2 font-semibold">Finished</th>
                    <th className="px-3 py-2 font-semibold">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {safeLogs.map((row) => {
                    const failed = String(row.status || '').toLowerCase() === 'failed';
                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-gray-50 align-top ${failed ? 'bg-red-50/70' : 'bg-white'}`}
                      >
                        <td className="px-3 py-2 text-gray-800 font-medium">{row.entity || '-'}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${failed ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {failed ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                            {row.status || '-'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-700">{asNumber(row.rows_processed)}</td>
                        <td className="px-3 py-2 text-gray-700">{asNumber(row.rows_inserted)}</td>
                        <td className="px-3 py-2 text-gray-700">{asNumber(row.rows_updated)}</td>
                        <td className="px-3 py-2 text-gray-700">{asNumber(row.rows_skipped)}</td>
                        <td className="px-3 py-2 text-gray-700">{row.duration_ms ?? '-'}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{formatDateTime(row.started_at)}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{formatDateTime(row.finished_at)}</td>
                        <td className={`px-3 py-2 ${failed ? 'text-red-700' : 'text-gray-500'}`}>
                          {row.error_message || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
