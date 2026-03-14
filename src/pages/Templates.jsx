import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseApi } from '@/api/supabaseService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, Trash2, X, Check, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { value: 'all', label: 'All Tabs' },
  { value: 'vana', label: 'Vana' },
  { value: 'matchtalk', label: 'Match Stock' },
  { value: 'greenforms', label: 'Green Forms' },
];

const TAB_COLORS = {
  vana: 'bg-emerald-100 text-emerald-700',
  matchtalk: 'bg-blue-100 text-blue-700',
  greenforms: 'bg-purple-100 text-purple-700',
  all: 'bg-gray-100 text-gray-600',
};

const EMPTY_FORM = { name: '', tab: 'all', day_step: 1, message: '', ppl: '' };

export default function Templates() {
  const queryClient = useQueryClient();
  const [filterTab, setFilterTab] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => supabaseApi.entities.Template.list('-day_step'),
  });

  const { data: greenformLeads = [] } = useQuery({
    queryKey: ['green-leads'],
    queryFn: () => supabaseApi.entities.GreenFormSubmittedLead.list(),
  });

  const pplOptions = greenformLeads.length > 0 
      ? [...new Set(greenformLeads.map(l => l.model_name || l.ppl).filter(Boolean))].sort()
    : [];

  const createMutation = useMutation({
    mutationFn: (data) => supabaseApi.entities.Template.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['templates'] }); resetForm(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => supabaseApi.entities.Template.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['templates'] }); resetForm(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => supabaseApi.entities.Template.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
  });

  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(false); };

  const handleEdit = (t) => {
    setForm({ name: t.name, tab: t.tab, day_step: t.day_step, message: t.message, ppl: t.ppl || '' });
    setEditingId(t.id);
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!form.name || !form.message) return;
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const filtered = filterTab === 'all' ? templates : templates.filter(t => t.tab === filterTab);

  const grouped = filtered.reduce((acc, t) => {
    const key = `${t.tab}-${t.day_step}`;
    if (!acc[key]) acc[key] = { tab: t.tab, day_step: t.day_step, items: [] };
    acc[key].items.push(t);
    return acc;
  }, {});

  const groups = Object.values(grouped).sort((a, b) => {
    const tabOrder = ['vana', 'matchtalk', 'greenforms', 'all'];
    return tabOrder.indexOf(a.tab) - tabOrder.indexOf(b.tab) || a.day_step - b.day_step;
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-gray-700" />
            <h1 className="text-lg font-bold text-gray-900">Templates</h1>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{templates.length}</span>
          </div>
          <Button
            onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); }}
            className="h-9 rounded-xl bg-gray-900 hover:bg-gray-700 text-xs gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add Template
          </Button>
        </div>

        {/* Tab filter */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {TABS.map(t => (
            <button
              key={t.value}
              onClick={() => setFilterTab(t.value)}
              className={cn(
                "text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap border transition-all",
                filterTab === t.value ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500 border-gray-200"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Add/Edit Form */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 text-sm">{editingId ? 'Edit Template' : 'New Template'}</h2>
              <button onClick={resetForm}><X className="w-4 h-4 text-gray-400" /></button>
            </div>

            <Input
              placeholder="Template name (e.g. Day 1 English)"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="h-9 text-sm rounded-xl"
            />

            <div className="flex gap-2">
              <Select value={form.tab} onValueChange={v => setForm({ ...form, tab: v })}>
                <SelectTrigger className="h-9 text-xs rounded-xl flex-1">
                  <SelectValue placeholder="Select Tab" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vana">Vana</SelectItem>
                  <SelectItem value="matchtalk">Match Stock</SelectItem>
                  <SelectItem value="greenforms">Green Forms</SelectItem>
                  <SelectItem value="all">All Tabs</SelectItem>
                </SelectContent>
              </Select>

              <Select value={String(form.day_step)} onValueChange={v => setForm({ ...form, day_step: Number(v) })}>
                <SelectTrigger className="h-9 text-xs rounded-xl flex-1">
                  <SelectValue placeholder="Day Step" />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7].map(d => (
                    <SelectItem key={d} value={String(d)}>Day {d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.tab === 'greenforms' && (
              <Select value={form.ppl} onValueChange={v => setForm({ ...form, ppl: v })}>
                <SelectTrigger className="h-9 text-xs rounded-xl">
                  <SelectValue placeholder="Select PPL (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>All PPLs</SelectItem>
                  {pplOptions.map(ppl => (
                    <SelectItem key={ppl} value={ppl}>{ppl}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="text-[10px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
              Placeholders: <span className="font-mono text-gray-500">{'{customer_name}'} {'{ppl}'} {'{pl}'} {'{ca_name}'}</span>
            </div>

            <Textarea
              placeholder="Write your message here..."
              value={form.message}
              onChange={e => setForm({ ...form, message: e.target.value })}
              className="text-sm rounded-xl min-h-[120px]"
            />

            <Button
              onClick={handleSubmit}
              disabled={!form.name || !form.message || createMutation.isPending || updateMutation.isPending}
              className="w-full h-9 rounded-xl bg-gray-900 hover:bg-gray-700 text-sm gap-1.5"
            >
              <Check className="w-4 h-4" />
              {editingId ? 'Save Changes' : 'Create Template'}
            </Button>
          </div>
        )}

        {/* Template Groups */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse h-24" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <FileText className="w-10 h-10 mb-3" />
            <p className="text-sm font-medium">No templates yet</p>
            <p className="text-xs mt-1">Tap "Add Template" to create one</p>
          </div>
        ) : (
          groups.map(group => (
            <div key={`${group.tab}-${group.day_step}`} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase", TAB_COLORS[group.tab])}>
                  {TABS.find(t => t.value === group.tab)?.label || group.tab}
                </span>
                <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  Day {group.day_step}
                </span>
              </div>
              {group.items.map(t => (
                <div key={t.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="font-semibold text-gray-800 text-sm">{t.name}</p>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleEdit(t)}
                        className="h-7 w-7 flex items-center justify-center rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5 text-gray-500" />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(t.id)}
                        className="h-7 w-7 flex items-center justify-center rounded-lg bg-red-50 hover:bg-red-100 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 whitespace-pre-wrap leading-relaxed line-clamp-4">{t.message}</p>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}