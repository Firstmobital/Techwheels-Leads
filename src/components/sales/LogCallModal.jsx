// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format, addDays, parseISO } from 'date-fns';

const SafeButton = /** @type {any} */ (Button);
const SafeDialog = /** @type {any} */ (Dialog);
const SafeDialogContent = /** @type {any} */ (DialogContent);
const SafeDialogHeader = /** @type {any} */ (DialogHeader);
const SafeDialogTitle = /** @type {any} */ (DialogTitle);

const VERDICT_OPTIONS = [
  { value: 'very_interested', label: 'Very interested' },
  { value: 'needs_info', label: 'Needs info' },
  { value: 'not_reachable', label: 'Not reachable' },
  { value: 'call_later', label: 'Call later' },
  { value: 'needs_discount', label: 'Needs discount' },
  { value: 'escalate', label: 'Escalate' },
  { value: 'booked', label: 'Booked' },
  { value: 'not_interested', label: 'Not interested' },
];

const VERDICT_COLORS = {
  very_interested: 'bg-green-50 text-green-700 border-green-200',
  needs_info: 'bg-blue-50 text-blue-700 border-blue-200',
  not_reachable: 'bg-gray-50 text-gray-700 border-gray-200',
  booked: 'bg-green-50 text-green-700 border-green-200',
  escalated: 'bg-purple-50 text-purple-700 border-purple-200',
  not_interested: 'bg-gray-50 text-gray-700 border-gray-200',
  needs_discount: 'bg-amber-50 text-amber-700 border-amber-200',
  call_later: 'bg-amber-50 text-amber-700 border-amber-200',
  escalate: 'bg-purple-50 text-purple-700 border-purple-200',
};

function getDefaultNextCallDate(verdict) {
  const today = new Date();
  
  if (verdict === 'very_interested') {
    return format(addDays(today, 1), 'yyyy-MM-dd');
  }
  
  if (verdict === 'needs_info' || verdict === 'call_later') {
    return format(addDays(today, 3), 'yyyy-MM-dd');
  }
  
  if (verdict === 'not_reachable' || verdict === 'needs_discount') {
    return format(addDays(today, 2), 'yyyy-MM-dd');
  }
  
  return '';
}

export default function LogCallModal({ open = true, walkin, onClose, onSubmit }) {
  const [selectedVerdict, setSelectedVerdict] = useState('');
  const [notes, setNotes] = useState('');
  const [nextCallDate, setNextCallDate] = useState('');
  const [escalateToName, setEscalateToName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!walkin) {
    return null;
  }

  const handleVerdictChange = (verdict) => {
    setSelectedVerdict(verdict);
    setError('');
    
    // Auto-fill next call date based on verdict
    if (verdict !== 'booked' && verdict !== 'not_interested') {
      const defaultDate = getDefaultNextCallDate(verdict);
      setNextCallDate(defaultDate);
    } else {
      setNextCallDate('');
    }
    
    // Clear escalate fields if not needed
    if (verdict !== 'escalate' && verdict !== 'needs_discount') {
      setEscalateToName('');
    }
  };

  const handleSubmit = async () => {
    if (!selectedVerdict) {
      setError('Please select a verdict');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        walkin_id: walkin.id,
        verdict: selectedVerdict,
        notes: notes.trim(),
        next_call_date: nextCallDate || null,
        escalate_to_name: escalateToName.trim() || null,
      });
      
      // Reset form and close
      setSelectedVerdict('');
      setNotes('');
      setNextCallDate('');
      setEscalateToName('');
      setError('');
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to log call. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const showNextCallDate = selectedVerdict && selectedVerdict !== 'booked' && selectedVerdict !== 'not_interested';
  const showEscalateTo = selectedVerdict === 'escalate' || selectedVerdict === 'needs_discount';

  return (
    <SafeDialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SafeDialogContent className="max-w-lg p-0 overflow-hidden">
        <SafeDialogHeader className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <SafeDialogTitle className="text-base">Log Call</SafeDialogTitle>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </SafeDialogHeader>

        <div className="px-4 py-4 space-y-4 max-h-[80vh] overflow-y-auto">
          
          {/* Customer info */}
          <div className="space-y-1">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</div>
            <div className="text-sm font-semibold text-gray-900">{walkin.customer_name}</div>
            <div className="text-xs text-gray-500">{walkin.mobile_number}</div>
          </div>

          {/* Verdict picker */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Call Outcome</label>
            <div className="flex flex-wrap gap-2">
              {VERDICT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleVerdictChange(option.value)}
                  className={cn(
                    'text-[12px] font-semibold px-3 py-1.5 rounded-full border transition-all',
                    selectedVerdict === option.value
                      ? cn(VERDICT_COLORS[option.value], 'ring-2 ring-offset-1 ring-current')
                      : 'text-gray-500 bg-gray-50 border-gray-200 hover:bg-gray-100'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What did the customer say?"
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
            />
          </div>

          {/* Next call date (conditional) */}
          {showNextCallDate && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Next Call Date</label>
              <input
                type="date"
                value={nextCallDate}
                onChange={(e) => setNextCallDate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          )}

          {/* Escalate to (conditional) */}
          {showEscalateTo && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Escalate To (Name)</label>
              <input
                type="text"
                value={escalateToName}
                onChange={(e) => setEscalateToName(e.target.value)}
                placeholder="Manager or team name"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-2">
          <SafeButton
            onClick={onClose}
            variant="outline"
            disabled={submitting}
            className="flex-1 rounded-lg h-9 text-xs font-semibold"
          >
            Cancel
          </SafeButton>
          <SafeButton
            onClick={handleSubmit}
            disabled={!selectedVerdict || submitting}
            className="flex-1 rounded-lg h-9 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white"
          >
            {submitting ? 'Logging...' : 'Log Call'}
          </SafeButton>
        </div>
      </SafeDialogContent>
    </SafeDialog>
  );
}
