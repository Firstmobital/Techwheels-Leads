import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { supabaseApi } from '@/api/supabaseService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const UIButton = /** @type {any} */ (Button);
const UIInput = /** @type {any} */ (Input);
const UITextarea = /** @type {any} */ (Textarea);

const EMPTY_FORM = {
  name: '',
  source: 'ai',
  model_name: '',
  step: '',
  category: 'vana',
  delay_days: '0',
  step_number: '1',
  channel: 'whatsapp',
  language: 'en',
  template_text: '',
  is_active: true,
};

const SOURCE_OPTIONS = ['ai', 'vna', 'match'];
const STEP_OPTIONS = ['M1', 'M2', 'M3', 'M4'];
const CATEGORY_OPTIONS = ['vana', 'matchtalk', 'greenforms', 'ai_leads'];

const toInteger = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const normalizeTemplatePayload = (form) => ({
  name: String(form.name || '').trim(),
  source: String(form.source || '').trim() || null,
  model_name: String(form.model_name || '').trim() || null,
  step: String(form.step || '').trim() || null,
  category: String(form.category || 'vana').trim().toLowerCase() || 'vana',
  delay_days: Math.max(0, toInteger(form.delay_days, 0)),
  step_number: Math.max(1, toInteger(form.step_number, 1)),
  channel: String(form.channel || 'whatsapp').trim() || 'whatsapp',
  language: String(form.language || 'en').trim() || 'en',
  template_text: String(form.template_text || '').trim(),
  is_active: Boolean(form.is_active),
});

export default function TemplatesSection() {
  const queryClient = useQueryClient();
  const [filterSource, setFilterSource] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: () => supabaseApi.entities.Template.list('-updated_at'),
  });

  const createMutation = /** @type {any} */ (useMutation({
    mutationFn: (payload) => supabaseApi.entities.Template.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      resetForm();
    },
  }));

  const updateMutation = /** @type {any} */ (useMutation({
    mutationFn: (variables) => {
      const safeVars = /** @type {any} */ (variables);
      return supabaseApi.entities.Template.update(safeVars?.id, safeVars?.payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      resetForm();
    },
  }));

  const deleteMutation = /** @type {any} */ (useMutation({
    mutationFn: (id) => supabaseApi.entities.Template.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
  }));

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (template) => {
    setForm({
      name: template.name || '',
      source: String(template.source || '').trim(),
      model_name: template.model_name || '',
      step: template.step || '',
      category: template.category || 'vana',
      delay_days: String(template.delay_days ?? 0),
      step_number: String(template.step_number ?? 1),
      channel: template.channel || 'whatsapp',
      language: template.language || 'en',
      template_text: template.template_text || '',
      is_active: template.is_active !== false,
    });
    setEditingId(template.id);
    setShowForm(true);
  };

  const handleSubmit = () => {
    const payload = normalizeTemplatePayload(form);
    if (!payload.name || !payload.source || !payload.template_text) return;

    if (editingId) {
      updateMutation.mutate({ id: editingId, payload });
      return;
    }

    createMutation.mutate(payload);
  };

  const sourceFilters = ['all', ...SOURCE_OPTIONS];

  const filteredTemplates = useMemo(() => {
    const rows = filterSource === 'all'
      ? templates
      : templates.filter((template) => String(template.source || '').trim().toLowerCase() === filterSource);

    return [...rows].sort((a, b) => {
      const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
      const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
      return bTime - aTime;
    });
  }, [templates, filterSource]);

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-24 pt-3 space-y-4 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-500" />
            <h2 className="font-semibold text-sm text-gray-800 dark:text-white">Templates</h2>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{templates.length}</span>
          </div>
          <UIButton
            onClick={() => {
              setShowForm(true);
              setEditingId(null);
              setForm(EMPTY_FORM);
            }}
            className="h-8 rounded-xl bg-gray-900 hover:bg-gray-700 text-xs gap-1 px-3"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </UIButton>
        </div>

        <div className="flex gap-2 px-4 py-2 overflow-x-auto border-b border-gray-50 dark:border-gray-700">
          {sourceFilters.map((source) => (
            <button
              key={source}
              onClick={() => setFilterSource(source)}
              className={cn(
                'text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap border transition-all',
                filterSource === source
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'
              )}
            >
              {source === 'all' ? 'All' : source.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-4">
          {showForm && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-800 dark:text-white text-sm">{editingId ? 'Edit Template' : 'New Template'}</h3>
                <button onClick={resetForm}><X className="w-4 h-4 text-gray-400" /></button>
              </div>

              <UIInput
                placeholder="Template name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="h-9 text-sm rounded-xl"
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <select
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  className="h-9 text-sm rounded-xl border border-input bg-background px-3"
                >
                  <option value="">Select source</option>
                  {SOURCE_OPTIONS.map((source) => (
                    <option key={source} value={source}>{source}</option>
                  ))}
                </select>

                {SOURCE_OPTIONS.includes(form.source) && (
                  <>
                    <UIInput
                      placeholder={form.source === 'ai' ? 'Model name' : 'Model name (optional)'}
                      value={form.model_name}
                      onChange={(e) => setForm({ ...form, model_name: e.target.value })}
                      className="h-9 text-sm rounded-xl"
                    />
                    <select
                      value={form.step}
                      onChange={(e) => setForm({ ...form, step: e.target.value })}
                      className="h-9 text-sm rounded-xl border border-input bg-background px-3"
                    >
                      <option value="">{form.source === 'ai' ? 'Select step' : 'Select step (optional)'}</option>
                      {STEP_OPTIONS.map((step) => (
                        <option key={step} value={step}>{step}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="h-9 text-sm rounded-xl border border-input bg-background px-3"
                >
                  {CATEGORY_OPTIONS.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
                <UIInput
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Step number"
                  value={form.step_number}
                  onChange={(e) => setForm({ ...form, step_number: e.target.value })}
                  className="h-9 text-sm rounded-xl"
                />
                <UIInput
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Delay days"
                  value={form.delay_days}
                  onChange={(e) => setForm({ ...form, delay_days: e.target.value })}
                  className="h-9 text-sm rounded-xl"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                Active template
              </label>

              <UITextarea
                placeholder="Template text"
                value={form.template_text}
                onChange={(e) => setForm({ ...form, template_text: e.target.value })}
                className="text-sm rounded-xl min-h-[140px]"
              />

              <UIButton
                onClick={handleSubmit}
                disabled={!form.name || !form.source || !form.template_text || createMutation.isPending || updateMutation.isPending}
                className="w-full h-9 rounded-xl bg-gray-900 hover:bg-gray-700 text-sm gap-1.5"
              >
                <Check className="w-4 h-4" /> {editingId ? 'Save Changes' : 'Create Template'}
              </UIButton>
            </div>
          )}

          {filteredTemplates.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-6">No templates found</p>
          ) : (
            <div className="space-y-2">
              {filteredTemplates.map((template) => (
                <div key={template.id} className="bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-100 dark:border-gray-600 p-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="space-y-1 min-w-0">
                      <p className="font-semibold text-gray-800 dark:text-white text-sm truncate">{template.name}</p>
                      <div className="flex flex-wrap gap-1">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{template.source ? String(template.source).toUpperCase() : '-'}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">{template.category || 'vana'}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{template.model_name || 'all models'}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{template.step || 'any step'}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">S{template.step_number ?? 1} / +{template.delay_days ?? 0}d</span>
                        <span className={cn(
                          'text-[10px] px-2 py-0.5 rounded-full',
                          template.is_active === false ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        )}>
                          {template.is_active === false ? 'inactive' : 'active'}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleEdit(template)}
                        className="h-6 w-6 flex items-center justify-center rounded-lg bg-white hover:bg-gray-100 border border-gray-200"
                      >
                        <Pencil className="w-3 h-3 text-gray-500" />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(template.id)}
                        className="h-6 w-6 flex items-center justify-center rounded-lg bg-red-50 hover:bg-red-100 border border-red-100"
                      >
                        <Trash2 className="w-3 h-3 text-red-500" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap line-clamp-4">
                    {template.template_text || ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
