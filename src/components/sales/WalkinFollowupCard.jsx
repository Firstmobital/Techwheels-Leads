// @ts-nocheck
import React, { useState } from 'react';
import { User, Phone, Car, Calendar, MessageCircle, PhoneCall, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format, parseISO, isBefore, startOfDay } from 'date-fns';
import { buildCallUrl, buildWhatsAppUrl } from '@/utils/phone';

const UIButton = /** @type {any} */ (Button);

const VERDICT_COLORS = {
  very_interested: 'bg-green-50 text-green-700 border-green-200',
  needs_info: 'bg-blue-50 text-blue-700 border-blue-200',
  not_reachable: 'bg-gray-50 text-gray-700 border-gray-200',
  booked: 'bg-green-50 text-green-700 border-green-200',
  escalated: 'bg-purple-50 text-purple-700 border-purple-200',
  not_interested: 'bg-gray-50 text-gray-700 border-gray-200',
  needs_discount: 'bg-amber-50 text-amber-700 border-amber-200',
  call_later: 'bg-amber-50 text-amber-700 border-amber-200',
  called: 'bg-blue-50 text-blue-700 border-blue-200',
  lost: 'bg-red-50 text-red-700 border-red-200',
};

const VERDICT_LABELS = {
  very_interested: 'Very Interested',
  needs_info: 'Needs Info',
  not_reachable: 'Not Reachable',
  booked: 'Booked',
  escalated: 'Escalated',
  not_interested: 'Not Interested',
  needs_discount: 'Needs Discount',
  call_later: 'Call Later',
  called: 'Called',
  lost: 'Lost',
};

function formatDate(dateString) {
  try {
    const parsed = typeof dateString === 'string' ? parseISO(dateString) : dateString;
    return format(parsed, 'dd MMM yyyy');
  } catch {
    return dateString;
  }
}

function isOverdue(dateString) {
  try {
    const parsed = typeof dateString === 'string' ? parseISO(dateString) : dateString;
    return isBefore(parsed, startOfDay(new Date()));
  } catch {
    return false;
  }
}

export default function WalkinFollowupCard({ walkin, onLogCall }) {
  const [activeInfoTab, setActiveInfoTab] = useState('details');

  if (!walkin) {
    return null;
  }

  const phone = walkin.mobile_number || '';
  const carModel = walkin.car?.name || '';
  const fuelTypes = Array.isArray(walkin.fuel_types) ? walkin.fuel_types.join(' · ') : '';
  const caName = walkin.salesperson
    ? `${walkin.salesperson.first_name || ''} ${walkin.salesperson.last_name || ''}`.trim()
    : '';

  const walkinDate = walkin.created_at ? formatDate(walkin.created_at) : '';
  const isDateOverdue = walkin.next_call_date ? isOverdue(walkin.next_call_date) : false;
  const nextCallDateFormatted = walkin.next_call_date ? formatDate(walkin.next_call_date) : null;

  const callLink = buildCallUrl(phone);
  const waLink = buildWhatsAppUrl(phone, '');

  const verdictColor = VERDICT_COLORS[walkin.last_verdict] || VERDICT_COLORS.called;
  const verdictLabel = VERDICT_LABELS[walkin.last_verdict] || 'Unknown';

  const handleWhatsApp = () => {
    if (!waLink) return;
    window.open(waLink, '_blank', 'noopener,noreferrer');
  };

  const handleCall = () => {
    if (!callLink) return;
    window.location.href = callLink;
  };

  const callHistory = Array.isArray(walkin.call_history) ? walkin.call_history : [];

  return (
    <div className={cn(
      'rounded-2xl shadow-sm border transition-all bg-white overflow-hidden',
      walkin.followup_status === 'booked' || walkin.followup_status === 'lost'
        ? 'border-gray-200 opacity-70'
        : 'border-gray-100',
      walkin.followup_status === 'escalated' ? 'border-l-4 border-l-purple-400' : ''
    )}>
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">

            {/* Name + status badges */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <h3 className="font-semibold text-gray-900 text-sm truncate">{walkin.customer_name}</h3>
              {walkin.followup_status && (
                <span className={cn(
                  'text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 border',
                  VERDICT_COLORS[walkin.followup_status] || 'bg-gray-50 text-gray-700 border-gray-200'
                )}>
                  {walkin.followup_status.charAt(0).toUpperCase() + walkin.followup_status.slice(1).replace('_', ' ')}
                </span>
              )}
            </div>

            {/* Phone */}
            <div className="flex items-center gap-1.5 mb-1">
              <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-xs text-gray-500 font-mono">{phone}</span>
            </div>

            {/* Car model + fuel types */}
            {carModel && (
              <div className="flex items-center gap-1.5 mb-1">
                <Car className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-xs text-gray-600 truncate">
                  {carModel}
                  {fuelTypes && ` · ${fuelTypes}`}
                </span>
              </div>
            )}

            {/* Salesperson */}
            {caName && (
              <div className="flex items-center gap-1.5 mb-1">
                <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="text-xs text-gray-600">CA: {caName}</span>
              </div>
            )}

          </div>

          {/* Right side: Verdict badge and action buttons */}
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            {walkin.last_verdict && (
              <span className={cn(
                'text-[10px] font-semibold px-2 py-1 rounded-full border',
                verdictColor
              )}>
                {verdictLabel}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-3 flex items-center gap-2">
          <UIButton
            onClick={handleCall}
            variant="outline"
            className="rounded-xl h-10 w-10 p-0 shadow-sm"
            aria-label="Call"
            title="Call"
            disabled={!callLink}
          >
            <PhoneCall className="w-5 h-5" />
          </UIButton>

          <UIButton
            onClick={handleWhatsApp}
            variant="outline"
            className="rounded-xl h-10 w-10 p-0 shadow-sm"
            aria-label="WhatsApp"
            title="WhatsApp"
            disabled={!waLink}
          >
            <MessageCircle className="w-5 h-5" />
          </UIButton>

          <UIButton
            onClick={() => onLogCall(walkin)}
            className="flex-1 rounded-xl h-10 px-3 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold shadow-sm"
          >
            Log Call
          </UIButton>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-1 grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setActiveInfoTab('details')}
              className={cn(
                'rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors',
                activeInfoTab === 'details' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              More Details
            </button>
            <button
              type="button"
              onClick={() => setActiveInfoTab('history')}
              className={cn(
                'rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors flex items-center justify-center gap-1',
                activeInfoTab === 'history' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <Clock className="w-3.5 h-3.5" />
              Contact History ({callHistory.length})
            </button>
          </div>

          {activeInfoTab === 'details' ? (
            <div className="mt-3 space-y-1">
              {walkinDate && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <span className="text-gray-600">Walkin: <span className="font-medium">{walkinDate}</span></span>
                </div>
              )}

              {walkin.token_number && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-gray-400">Token:</span>
                  <span className="text-gray-700 font-medium">{walkin.token_number}</span>
                </div>
              )}

              {walkin.call_count !== undefined && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-gray-400">Calls:</span>
                  <span className="text-gray-700 font-medium">{walkin.call_count} call{walkin.call_count !== 1 ? 's' : ''} logged</span>
                </div>
              )}

              {nextCallDateFormatted && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <span className={cn(
                    'font-medium',
                    isDateOverdue ? 'text-red-600' : 'text-gray-600'
                  )}>
                    Next call: {nextCallDateFormatted}
                    {isDateOverdue && ' (Overdue)'}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-3 space-y-1.5">
              {callHistory.length === 0 ? (
                <p className="text-xs text-gray-400">No contact history yet</p>
              ) : callHistory.map((call, idx) => {
                const callDate = call.created_at ? formatDate(call.created_at) : 'Unknown date';
                const callVerdict = call.verdict ? VERDICT_LABELS[call.verdict] || call.verdict : 'No verdict';
                return (
                  <div key={idx} className="flex items-start gap-2 text-[10px] bg-gray-50 p-2 rounded-lg">
                    <span className="text-gray-500 flex-shrink-0">{callDate}</span>
                    <span className={cn(
                      'font-semibold px-1.5 py-0.5 rounded border flex-shrink-0',
                      VERDICT_COLORS[call.verdict] || 'bg-gray-100 text-gray-700 border-gray-200'
                    )}>
                      {callVerdict}
                    </span>
                    {call.notes && (
                      <span className="text-gray-600 flex-1">{call.notes}</span>
                    )}
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
