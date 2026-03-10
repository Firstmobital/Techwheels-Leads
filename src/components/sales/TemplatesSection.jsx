import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { FileText, Plus, Pencil, Trash2, X, Check, Paperclip, ImageIcon, Loader2, Upload, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SelectItem } from '@/components/ui/select';
import MobileSelect from '@/components/shared/MobileSelect';
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
const EMPTY_FORM = { name: '', tab: 'all', day_step: 1, ppl: '', message: '', attachments: [] };

export default function TemplatesSection() {
  const queryClient = useQueryClient();
  const [filterTab, setFilterTab] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [importing, setImporting] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: () => base44.entities.Template.list('-day_step'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Template.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['templates'] }); resetForm(); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Template.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['templates'] }); resetForm(); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Template.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
  });

  const handleBulkImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    const items = rows.map(row => ({
      name: row.name || '',
      tab: row.tab || 'all',
      day_step: Number(row.day_step) || 1,
      message: row.message || '',
      ppl: row.ppl ? String(row.ppl).trim() : '',
      attachments: row.attachments ? (Array.isArray(row.attachments) ? row.attachments : []) : [],
    }));
    for (const item of items) {
      await base44.entities.Template.create(item);
    }
    await queryClient.invalidateQueries({ queryKey: ['templates'] });
    setImporting(false);
    e.target.value = '';
  };

  const handleExport = () => {
    const exportData = templates.map(({ id, created_date, updated_date, created_by, ...rest }) => rest);
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Templates');
    XLSX.writeFile(wb, `templates-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(false); };
  const handleEdit = (t) => {
    setForm({ name: t.name, tab: t.tab, day_step: t.day_step, ppl: t.ppl || '', message: t.message, attachments: t.attachments || [] });
    setEditingId(t.id);
    setShowForm(true);
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploadingFile(true);
    const urls = [];
    for (const file of files) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      urls.push(file_url);
    }
    setForm(prev => ({ ...prev, attachments: [...(prev.attachments || []), ...urls] }));
    setUploadingFile(false);
    e.target.value = '';
  };

  const removeAttachment = (idx) => {
    setForm(prev => ({ ...prev, attachments: prev.attachments.filter((_, i) => i !== idx) }));
  };

  const handleSubmit = () => {
    if (!form.name || !form.message) return;
    if (editingId) updateMutation.mutate({ id: editingId, data: form });
    else createMutation.mutate(form);
  };

  const filteredTemplates = filterTab === 'all' ? templates : templates.filter(t => t.tab === filterTab);
  const grouped = filteredTemplates.reduce((acc, t) => {
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
    <div className="flex-1 overflow-y-auto px-4 pb-24 pt-3 space-y-4 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-500" />
            <h2 className="font-semibold text-sm text-gray-800 dark:text-white">Templates</h2>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{templates.length}</span>
          </div>
          <div className="flex gap-2">
            <label className={cn("cursor-pointer flex items-center gap-1 h-8 rounded-xl text-xs px-3 font-medium bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 transition-all", importing && "opacity-50 pointer-events-none")}>
              {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {importing ? 'Importing...' : 'Import'}
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleBulkImport} disabled={importing} />
            </label>
            <Button onClick={handleExport} variant="outline" className="h-8 rounded-xl text-xs gap-1 px-3">
              <Download className="w-3.5 h-3.5" /> Export
            </Button>
            <Button
              onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); }}
              className="h-8 rounded-xl bg-gray-900 hover:bg-gray-700 text-xs gap-1 px-3"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          </div>
        </div>

        {/* Tab filter */}
        <div className="flex gap-2 px-4 py-2 overflow-x-auto border-b border-gray-50 dark:border-gray-700">
          {TABS.map(t => (
            <button
              key={t.value}
              onClick={() => setFilterTab(t.value)}
              className={cn(
                "text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap border transition-all",
                filterTab === t.value ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-4">
          {!showForm && (
            <p className="text-[10px] text-gray-400 text-center">
              Import accepts an Excel file with columns: <span className="font-mono">name, tab, day_step, message, ppl (optional)</span>
            </p>
          )}

          {showForm && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-800 dark:text-white text-sm">{editingId ? 'Edit Template' : 'New Template'}</h3>
                <button onClick={resetForm}><X className="w-4 h-4 text-gray-400" /></button>
              </div>
              <Input placeholder="Template name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-9 text-sm rounded-xl" />
              <div className="flex gap-2">
                <MobileSelect value={form.tab} onValueChange={v => setForm({ ...form, tab: v })} placeholder="Tab" className="h-9 flex-1">
                  <SelectItem value="vana">Vana</SelectItem>
                  <SelectItem value="matchtalk">Match Stock</SelectItem>
                  <SelectItem value="greenforms">Green Forms</SelectItem>
                  <SelectItem value="all">All Tabs</SelectItem>
                </MobileSelect>
                <MobileSelect value={String(form.day_step)} onValueChange={v => setForm({ ...form, day_step: Number(v) })} placeholder="Day" className="h-9 flex-1">
                  {[1,2,3,4,5,6,7].map(d => <SelectItem key={d} value={String(d)}>Day {d}</SelectItem>)}
                </MobileSelect>
              </div>
              <Input
                placeholder="PPL filter (e.g. Harrier EV) — leave empty for all models"
                value={form.ppl}
                onChange={e => setForm({ ...form, ppl: e.target.value })}
                className="h-9 text-sm rounded-xl"
              />
              <div className="text-[10px] text-gray-400 bg-white dark:bg-gray-600 rounded-lg px-3 py-2 border border-gray-100 dark:border-gray-500">
                Placeholders: <span className="font-mono text-gray-500 dark:text-gray-300">{'{customer_name}'} {'{ppl}'} {'{pl}'} {'{ca_name}'}</span>
              </div>
              <Textarea
                placeholder="Write your message..."
                value={form.message}
                onChange={e => { setForm({ ...form, message: e.target.value }); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                className="text-sm rounded-xl min-h-[160px] resize-none overflow-hidden"
              />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300 flex items-center gap-1">
                    <Paperclip className="w-3.5 h-3.5" /> Attachments (PDF / Photos)
                  </span>
                  <label className={cn("cursor-pointer flex items-center gap-1 text-xs bg-white border border-gray-200 hover:bg-gray-50 px-2.5 py-1 rounded-lg font-medium text-gray-600 transition-all", uploadingFile && "opacity-50 pointer-events-none")}>
                    {uploadingFile ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    {uploadingFile ? 'Uploading...' : 'Add File'}
                    <input type="file" accept="image/*,.pdf" multiple className="hidden" onChange={handleFileUpload} disabled={uploadingFile} />
                  </label>
                </div>
                {form.attachments?.length > 0 && (
                  <div className="space-y-1.5">
                    {form.attachments.map((url, idx) => {
                      const isPdf = url.includes('.pdf') || url.includes('pdf');
                      const name = url.split('/').pop().split('?')[0] || `File ${idx + 1}`;
                      return (
                        <div key={idx} className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg px-2.5 py-1.5">
                          {isPdf ? <FileText className="w-3.5 h-3.5 text-red-400 flex-shrink-0" /> : <ImageIcon className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
                          <span className="text-xs text-gray-600 flex-1 truncate">{name}</span>
                          <button onClick={() => removeAttachment(idx)} className="text-gray-300 hover:text-red-400">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <Button onClick={handleSubmit} disabled={!form.name || !form.message} className="w-full h-9 rounded-xl bg-gray-900 hover:bg-gray-700 text-sm gap-1.5">
                <Check className="w-4 h-4" /> {editingId ? 'Save Changes' : 'Create Template'}
              </Button>
            </div>
          )}

          {groups.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-6">No templates yet</p>
          ) : (
            groups.map(group => (
              <div key={`${group.tab}-${group.day_step}`} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase", TAB_COLORS[group.tab])}>
                    {TABS.find(t => t.value === group.tab)?.label || group.tab}
                  </span>
                  <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Day {group.day_step}</span>
                </div>
                {group.items.map(t => (
                  <div key={t.id} className="bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-100 dark:border-gray-600 p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-semibold text-gray-800 dark:text-white text-sm">{t.name}</p>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => handleEdit(t)} className="h-6 w-6 flex items-center justify-center rounded-lg bg-white hover:bg-gray-100 border border-gray-200">
                          <Pencil className="w-3 h-3 text-gray-500" />
                        </button>
                        <button onClick={() => deleteMutation.mutate(t.id)} className="h-6 w-6 flex items-center justify-center rounded-lg bg-red-50 hover:bg-red-100 border border-red-100">
                          <Trash2 className="w-3 h-3 text-red-500" />
                        </button>
                      </div>
                    </div>
                    {t.ppl && (
                      <span className="inline-block text-[10px] font-medium bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full mb-1">
                        🚗 {t.ppl}
                      </span>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap line-clamp-3">{t.message}</p>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}