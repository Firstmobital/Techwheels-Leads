import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { User, Phone, Car, MessageSquare, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STATUS_OPTIONS = ['New', 'Contacted', 'Interested', 'Closed'];
const STATUS_COLORS = {
  New: 'bg-blue-100 text-blue-700',
  Contacted: 'bg-yellow-100 text-yellow-700',
  Interested: 'bg-green-100 text-green-700',
  Closed: 'bg-gray-100 text-gray-500',
};

export default function AILeadCard({ lead, currentUser, isAdmin }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [remarks, setRemarks] = useState(lead.remarks || '');
  const [status, setStatus] = useState(lead.status || 'New');
  const [saving, setSaving] = useState(false);

  const isMyLead = lead.assigned_to === currentUser?.email;

  const takeMutation = useMutation({
    mutationFn: () => base44.entities.AIGeneratedLead.update(lead.id, {
      assigned_to: currentUser.email,
      ca_name: currentUser.full_name,
      assignment_date: new Date().toISOString(),
      is_assigned: true,
      status: 'Contacted',
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-leads'] }),
  });

  const saveUpdate = async () => {
    setSaving(true);
    await base44.entities.AIGeneratedLead.update(lead.id, { status, remarks });
    queryClient.invalidateQueries({ queryKey: ['ai-leads'] });
    setSaving(false);
  };

  const waLink = `https://wa.me/${lead.phone_number?.replace(/\D/g, '')}`;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-3">
      <div className="px-4 py-3">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="font-semibold text-sm text-gray-900 truncate">{lead.customer_name}</span>
            </div>
            {lead.phone_number && (
              <a href={waLink} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-emerald-600 hover:underline">
                <Phone className="w-3 h-3" />
                {lead.phone_number}
              </a>
            )}
          </div>
          <span className={`text-[10px] px-2 py-1 rounded-full font-semibold flex-shrink-0 ${STATUS_COLORS[status] || STATUS_COLORS.New}`}>
            {status}
          </span>
        </div>

        {/* Car interest */}
        {lead.car_of_interest && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-600">
            <Car className="w-3.5 h-3.5 text-purple-400" />
            <span>{lead.car_of_interest}</span>
          </div>
        )}

        {/* Chat details */}
        {lead.chat_details && (
          <div className="mt-2">
            <div className="flex items-center gap-1 text-[10px] text-gray-400 mb-0.5">
              <MessageSquare className="w-3 h-3" />
              Chat Details
            </div>
            <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-2 py-1.5 whitespace-pre-wrap line-clamp-6">
              {lead.chat_details}
            </p>
          </div>
        )}

        {/* Assigned badge */}
        {lead.is_assigned && (
          <div className="mt-2 flex items-center gap-1 text-[10px] text-gray-500">
            <CheckCircle className="w-3 h-3 text-green-500" />
            <span>Assigned to {isAdmin ? lead.ca_name || lead.assigned_to : 'you'}</span>
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex gap-2">
          {!lead.is_assigned && (
            <Button
              size="sm"
              className="flex-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-8"
              onClick={() => takeMutation.mutate()}
              disabled={takeMutation.isPending}
            >
              {takeMutation.isPending ? 'Taking...' : '✋ Take Lead'}
            </Button>
          )}
          {(isMyLead || isAdmin) && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs rounded-xl h-8"
              onClick={() => setExpanded(e => !e)}
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
              {expanded ? 'Hide' : 'Update'}
            </Button>
          )}
        </div>
      </div>

      {/* Expanded section */}
      {expanded && (isMyLead || isAdmin) && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
          {/* Chat details */}
          {lead.chat_details && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                <MessageSquare className="w-3.5 h-3.5" />
                Chat Details
              </div>
              <p className="text-xs text-gray-500 bg-white rounded-lg p-2 border border-gray-100 whitespace-pre-wrap max-h-28 overflow-y-auto">
                {lead.chat_details}
              </p>
            </div>
          )}

          {/* Status */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Status</label>
            <div className="flex gap-1.5 flex-wrap">
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`text-[10px] px-2.5 py-1 rounded-full font-medium border transition-all ${
                    status === s ? `${STATUS_COLORS[s]} border-transparent` : 'bg-white text-gray-500 border-gray-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Remarks</label>
            <textarea
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              rows={2}
              placeholder="Add remarks..."
              className="w-full text-xs rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-300 resize-none"
            />
          </div>

          <Button
            size="sm"
            className="w-full text-xs bg-gray-900 hover:bg-gray-800 text-white rounded-xl h-8"
            onClick={saveUpdate}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      )}
    </div>
  );
}