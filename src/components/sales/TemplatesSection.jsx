import React, { useMemo, useRef, useState } from'react';
import { useMutation, useQuery, useQueryClient } from'@tanstack/react-query';
import { FileText, Plus, Pencil, Trash2, X, Check, Eye, EyeOff } from'lucide-react';
import { supabaseApi } from'@/api/supabaseService';
import { Button } from'@/components/ui/button';
import { Input } from'@/components/ui/input';
import { Textarea } from'@/components/ui/textarea';
import { cn } from'@/lib/utils';

const UIButton = /** @type {any} */ (Button);
const UIInput = /** @type {any} */ (Input);
const UITextarea = /** @type {any} */ (Textarea);

// ─── Constants ────────────────────────────────────────────────────────────────

const TAB_OPTIONS = [
 { value:'vana', label:'VNA', color:'bg-amber-50 text-amber-800 border-amber-200' },
 { value:'matchtalk', label:'Match Stock', color:'bg-emerald-50 text-emerald-800 border-emerald-200' },
 { value:'greenforms', label:'Green Forms', color:'bg-blue-50 text-blue-800 border-blue-200' },
 { value:'ai_leads', label:'AI Leads', color:'bg-purple-50 text-purple-800 border-purple-200' },
];

// Maps category → source so we keep both fields in sync on save
const CATEGORY_TO_SOURCE = {
 vana:'vna',
 matchtalk:'match',
 greenforms:'walkin',
 ai_leads:'ai',
};

const AI_STEP_OPTIONS = [
 { value:'M1', label:'M1 — first follow-up (day 1 after assignment)' },
 { value:'M2', label:'M2 — second follow-up (day 2)' },
 { value:'M3', label:'M3 — third follow-up (day 5)' },
 { value:'M4', label:'M4 — fourth follow-up (day 10)' },
];

const VARIABLES = [
 { token:'{customer_name}', hint:'Customer full name' },
 { token:'{ppl}', hint:'Car model (e.g. Harrier, Nexon)' },
 { token:'{pl}', hint:'Variant (e.g. XZ+ MT, XMS)' },
 { token:'{ca_name}', hint:'Sales advisor / CA name' },
 { token:'{chassis_no}', hint:'Chassis number (Match Stock)' },
 { token:'{colour}', hint:'Car colour' },
 { token:'{variant}', hint:'Variant (alias for pl)' },
 { token:'{model}', hint:'Car model (alias for ppl)' },
];

// Dummy values used in live preview
const PREVIEW_DATA = {
'{customer_name}':'Rajesh Kumar',
'{name}':'Rajesh Kumar',
'{ppl}':'Harrier Adventure+',
'{model}':'Harrier Adventure+',
'{pl}':'XZA+ MT',
'{variant}':'XZA+ MT',
'{ca_name}':'Amit Sharma',
'{sales_person}':'Amit Sharma',
'{salesperson}':'Amit Sharma',
'{car}':'Harrier Adventure+',
'{colour}':'Pristine White',
'{color}':'Pristine White',
'{chassis_no}':'MAT626077SKK76785',
'{chassis}':'MAT626077SKK76785',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toInt = (v, fb) => {
 const p = Number.parseInt(String(v ??'').trim(), 10);
 return Number.isFinite(p) ? p : fb;
};

const fillPreview = (text) =>
 Object.entries(PREVIEW_DATA).reduce(
 (acc, [token, val]) => acc.replace(new RegExp(token.replace(/[{}]/g,'\\$&'),'g'), val),
 text
 );

const getTabMeta = (value) => TAB_OPTIONS.find((t) => t.value === value) ?? TAB_OPTIONS[0];

const buildPayload = (form) => ({
 name: String(form.name ||'').trim(),
 category: String(form.category ||'vana').trim().toLowerCase(),
 source: CATEGORY_TO_SOURCE[form.category] ??'walkin',
 model_name: String(form.model_name ||'').trim() || null,
 // AI leads uses step field; others use step_number + delay_days
 step: form.category ==='ai_leads' ? String(form.ai_step ||'M1').trim() : null,
 step_number: form.category !=='ai_leads' ? Math.max(1, toInt(form.step_number, 1)) : 1,
 delay_days: form.category !=='ai_leads' ? Math.max(0, toInt(form.delay_days, 0)) : 0,
 channel:'whatsapp',
 language: String(form.language ||'en').trim(),
 template_text: String(form.template_text ||'').trim(),
 is_active: Boolean(form.is_active),
});

const EMPTY_FORM = {
 name:'',
 category:'vana',
 model_name:'',
 ai_step:'M1',
 step_number:'1',
 delay_days:'0',
 language:'en',
 template_text:'',
 is_active: true,
};

// ─── Tab filter pill ──────────────────────────────────────────────────────────
function FilterPill({ value, label, count, active, onClick }) {
 return (
 <button
 onClick={onClick}
 className={cn(
'flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-all whitespace-nowrap',
 active
 ?'bg-gray-900 text-white border-gray-900'
 :'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
 )}
 >
 {label}{count !== undefined ?` (${count})` :''}
 </button>
 );
}

// ─── Category badge ───────────────────────────────────────────────────────────
function CategoryBadge({ category }) {
 const meta = getTabMeta(category);
 return (
 <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border', meta.color)}>
 {meta.label}
 </span>
 );
}

// ─── Sequence visualiser (M1 › M2 › M3) ─────────────────────────────────────
function SequenceBar({ templates, thisStepNumber }) {
 // Sort all templates in this group by step_number and render dots
 const sorted = [...templates].sort((a, b) => toInt(a.step_number, 1) - toInt(b.step_number, 1));
 if (sorted.length <= 1) return null;
 return (
 <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-gray-100">
 {sorted.map((t, i) => {
 const sn = toInt(t.step_number, i + 1);
 const isCurrent = sn === thisStepNumber;
 return (
 <React.Fragment key={t.id || i}>
 <div className={cn(
'text-[10px] font-semibold px-2 py-0.5 rounded-md border',
 isCurrent
 ?'bg-gray-900 text-white border-gray-900'
 :'bg-gray-50 text-gray-500 border-gray-200'
 )}>
 M{i + 1}
 </div>
 {i < sorted.length - 1 && (
 <div className="text-gray-300 text-xs">›</div>
 )}
 </React.Fragment>
 );
 })}
 <span className="text-[10px] text-gray-400 ml-1">{sorted.length}-message sequence</span>
 </div>
 );
}

// ─── Template card ────────────────────────────────────────────────────────────
function TemplateCard({ template, siblings, onEdit, onDelete, isDeleting }) {
 const [expanded, setExpanded] = useState(false);
 const stepNumber = toInt(template.step_number, 1);
 const delayDays = toInt(template.delay_days, 0);
 const isAI = template.category ==='ai_leads';

 const delayLabel = isAI
 ?`Step ${template.step ||'—'}`
 : delayDays === 0
 ?'Sends on day 0 (first message)'
 :`Sends ${delayDays} day${delayDays !== 1 ?'s' :''} after M1`;

 return (
 <div className={cn(
'rounded-xl border overflow-hidden transition-all',
 template.is_active === false
 ?'border-gray-100 opacity-60'
 :'border-gray-100 bg-white'
 )}>
 {/* Card header */}
 <div className="flex items-start justify-between gap-3 p-3">
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap mb-1.5">
 <span className="text-sm font-medium text-gray-900 truncate">{template.name}</span>
 {template.is_active === false && (
 <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200">
 Inactive
 </span>
 )}
 </div>
 <div className="flex flex-wrap gap-1.5">
 <CategoryBadge category={template.category ||'vana'} />
 {!isAI && (
 <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-blue-50 text-blue-800 border-blue-200">
 M{stepNumber}
 </span>
 )}
 {isAI && template.step && (
 <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-purple-50 text-purple-800 border-purple-200">
 {template.step}
 </span>
 )}
 <span className="text-[10px] px-2 py-0.5 rounded-full border bg-gray-50 text-gray-600 border-gray-200">
 {delayLabel}
 </span>
 {template.model_name && (
 <span className="text-[10px] px-2 py-0.5 rounded-full border bg-gray-50 text-gray-600 border-gray-200">
 {template.model_name}
 </span>
 )}
 </div>
 </div>
 <div className="flex items-center gap-1 flex-shrink-0">
 <button
 onClick={() => setExpanded(e => !e)}
 className="h-7 w-7 flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
 title={expanded ?'Collapse' :'Expand'}
 >
 {expanded
 ? <EyeOff className="w-3.5 h-3.5 text-gray-400" />
 : <Eye className="w-3.5 h-3.5 text-gray-400" />}
 </button>
 <button
 onClick={() => onEdit(template)}
 className="h-7 w-7 flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
 title="Edit"
 >
 <Pencil className="w-3 h-3 text-gray-500" />
 </button>
 <button
 onClick={() => onDelete(template.id)}
 disabled={isDeleting}
 className="h-7 w-7 flex items-center justify-center rounded-lg border border-red-100 bg-red-50 hover:bg-red-100 transition-colors"
 title="Delete"
 >
 <Trash2 className="w-3 h-3 text-red-500" />
 </button>
 </div>
 </div>

 {/* Message preview — collapsed = 2 lines, expanded = full */}
 <div className="px-3 pb-3">
 <p className={cn(
'text-xs text-gray-500 whitespace-pre-wrap leading-relaxed',
 !expanded &&'line-clamp-2'
 )}>
 {template.template_text ||''}
 </p>
 </div>

 {/* Full filled preview when expanded */}
 {expanded && template.template_text && (
 <div className="mx-3 mb-3 rounded-lg bg-gray-50 border border-gray-100 p-3">
 <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-2">
 Live preview (dummy data)
 </p>
 <div className="bg-white rounded-lg p-2.5 border border-gray-100">
 <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
 {fillPreview(template.template_text)}
 </p>
 </div>
 </div>
 )}

 {/* Sequence bar — shows where this step sits in the sequence */}
 {!isAI && siblings && siblings.length > 1 && (
 <div className="px-3 pb-3">
 <SequenceBar templates={siblings} thisStepNumber={stepNumber} />
 </div>
 )}
 </div>
 );
}

// ─── Create / Edit form ───────────────────────────────────────────────────────
function TemplateForm({ editingId, initialForm, onSave, onCancel, isSaving }) {
 const [form, setForm] = useState(initialForm);
 const textareaRef = useRef(null);
 const isAI = form.category ==='ai_leads';

 const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

 const insertVariable = (token) => {
 const ta = textareaRef.current;
 if (!ta) return;
 const start = ta.selectionStart;
 const end = ta.selectionEnd;
 const next = ta.value.slice(0, start) + token + ta.value.slice(end);
 set('template_text', next);
 // restore cursor after React re-render
 requestAnimationFrame(() => {
 ta.selectionStart = ta.selectionEnd = start + token.length;
 ta.focus();
 });
 };

 const delayHint = () => {
 const d = toInt(form.delay_days, 0);
 const s = toInt(form.step_number, 1);
 if (s === 1) return'First message — sends immediately when CA taps M1';
 if (d === 0) return`M${s} — sends same day as M1 (no delay)`;
 return`M${s} — sends ${d} day${d !== 1 ?'s' :''} after M1 was first sent`;
 };

 const isValid = form.name.trim() && form.template_text.trim();

 return (
 <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-4">
 {/* Form header */}
 <div className="flex items-center justify-between">
 <h3 className="text-sm font-medium text-gray-900">
 {editingId ?'Edit template' :'New template'}
 </h3>
 <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
 <X className="w-4 h-4" />
 </button>
 </div>

 {/* Name */}
 <div>
 <label className="block text-xs font-medium text-gray-500 mb-1.5">Template name</label>
 <UIInput
 placeholder="e.g. VNA Follow-up 1"
 value={form.name}
 onChange={e => set('name', e.target.value)}
 className="h-9 text-sm rounded-xl"
 />
 </div>

 {/* Tab + Language */}
 <div className="grid grid-cols-2 gap-3">
 <div>
 <label className="block text-xs font-medium text-gray-500 mb-1.5">Tab (where it appears)</label>
 <select
 value={form.category}
 onChange={e => set('category', e.target.value)}
 className="w-full h-9 text-sm rounded-xl border border-gray-200 bg-white px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
 >
 {TAB_OPTIONS.map(t => (
 <option key={t.value} value={t.value}>{t.label}</option>
 ))}
 </select>
 </div>
 <div>
 <label className="block text-xs font-medium text-gray-500 mb-1.5">Language</label>
 <select
 value={form.language}
 onChange={e => set('language', e.target.value)}
 className="w-full h-9 text-sm rounded-xl border border-gray-200 bg-white px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
 >
 <option value="en">English</option>
 <option value="hi">Hindi</option>
 <option value="en+hi">Both</option>
 </select>
 </div>
 </div>

 {/* Sequence fields — only for non-AI tabs */}
 {!isAI && (
 <div className="space-y-3">
 <div className="grid grid-cols-2 gap-3">
 <div>
 <label className="block text-xs font-medium text-gray-500 mb-1.5">
 Message number
 <span className="ml-1 text-gray-400 font-normal">(M1 = first, M2 = second…)</span>
 </label>
 <UIInput
 type="number" min="1" max="10" step="1"
 value={form.step_number}
 onChange={e => set('step_number', e.target.value)}
 className="h-9 text-sm rounded-xl"
 />
 </div>
 <div>
 <label className="block text-xs font-medium text-gray-500 mb-1.5">
 Send after (days)
 <span className="ml-1 text-gray-400 font-normal">(0 = immediately)</span>
 </label>
 <UIInput
 type="number" min="0" max="30" step="1"
 value={form.delay_days}
 onChange={e => set('delay_days', e.target.value)}
 className="h-9 text-sm rounded-xl"
 />
 </div>
 </div>
 {/* Plain-English timing summary */}
 <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
 <div className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0 mt-1.5" />
 <p className="text-xs text-amber-800 leading-relaxed">{delayHint()}</p>
 </div>
 </div>
 )}

 {/* AI step selector */}
 {isAI && (
 <div>
 <label className="block text-xs font-medium text-gray-500 mb-1.5">Follow-up step</label>
 <select
 value={form.ai_step}
 onChange={e => set('ai_step', e.target.value)}
 className="w-full h-9 text-sm rounded-xl border border-gray-200 bg-white px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
 >
 {AI_STEP_OPTIONS.map(s => (
 <option key={s.value} value={s.value}>{s.label}</option>
 ))}
 </select>
 <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
 Day offsets are fixed: M1 = day 1, M2 = day 2, M3 = day 5, M4 = day 10 after the lead is assigned.
 </p>
 </div>
 )}

 {/* Car model */}
 <div>
 <label className="block text-xs font-medium text-gray-500 mb-1.5">
 Car model
 <span className="ml-1 text-gray-400 font-normal">(optional — blank = applies to all models)</span>
 </label>
 <UIInput
 placeholder="e.g. Swift Dzire, Baleno…"
 value={form.model_name}
 onChange={e => set('model_name', e.target.value)}
 className="h-9 text-sm rounded-xl"
 />
 </div>

 {/* Message text */}
 <div>
 <label className="block text-xs font-medium text-gray-500 mb-1.5">Message text</label>
 {/* Variable pills */}
 <div className="flex flex-wrap gap-1.5 mb-2">
 {VARIABLES.map(v => (
 <button
 key={v.token}
 type="button"
 onClick={() => insertVariable(v.token)}
 title={v.hint}
 className="text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-0.5 hover:bg-blue-100 transition-colors"
 >
 {v.token}
 </button>
 ))}
 </div>
 <UITextarea
 ref={textareaRef}
 placeholder={`Hello {customer_name},\n\nYour {ppl} update…`}
 value={form.template_text}
 onChange={e => set('template_text', e.target.value)}
 className="text-sm rounded-xl min-h-[140px] leading-relaxed"
 />
 </div>

 {/* Live preview */}
 {form.template_text.trim() && (
 <div className="rounded-xl border border-gray-100 overflow-hidden">
 <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
 <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
 Live preview — how customer sees it
 </p>
 </div>
 <div className="p-3 bg-white">
 <div className="bg-[#dcf8c6] rounded-xl rounded-bl-sm p-3 max-w-[85%]">
 <p className="text-xs text-gray-900 whitespace-pre-wrap leading-relaxed">
 {fillPreview(form.template_text)}
 </p>
 </div>
 <p className="text-[10px] text-gray-300 mt-1.5 ml-1">Using dummy data for preview</p>
 </div>
 </div>
 )}

 {/* Active toggle */}
 <label className="flex items-center gap-2.5 cursor-pointer">
 <input
 type="checkbox"
 checked={form.is_active}
 onChange={e => set('is_active', e.target.checked)}
 className="rounded"
 />
 <span className="text-xs text-gray-600">
 Active — this template will appear as a button in its tab
 </span>
 </label>

 {/* Submit */}
 <UIButton
 onClick={() => onSave(buildPayload(form))}
 disabled={!isValid || isSaving}
 className="w-full h-10 rounded-xl bg-gray-900 hover:bg-gray-700 text-sm font-medium gap-2"
 >
 <Check className="w-4 h-4" />
 {isSaving ?'Saving…' : editingId ?'Save changes' :'Create template'}
 </UIButton>
 </div>
 );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TemplatesSection() {
 const queryClient = useQueryClient();
 const [filterCat, setFilterCat] = useState('all');
 const [editingId, setEditingId] = useState(null);
 const [showForm, setShowForm] = useState(false);
 const [formInitial, setFormInitial] = useState(EMPTY_FORM);

 const { data: templates = [], isLoading } = useQuery({
 queryKey: ['templates'],
 queryFn: () => supabaseApi.entities.Template.list('-updated_at'),
 });

 const createMutation = /** @type {any} */ (useMutation({
 mutationFn: (/** @type {any} */ payload) => supabaseApi.entities.Template.create(payload),
 onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['templates'] }); closeForm(); },
 }));

 const updateMutation = /** @type {any} */ (useMutation({
 mutationFn: (/** @type {{ id: any, payload: any }} */ { id, payload }) => supabaseApi.entities.Template.update(id, payload),
 onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['templates'] }); closeForm(); },
 }));

 const deleteMutation = /** @type {any} */ (useMutation({
 mutationFn: (id) => supabaseApi.entities.Template.delete(id),
 onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
 }));

 const closeForm = () => { setShowForm(false); setEditingId(null); setFormInitial(EMPTY_FORM); };

 const handleEdit = (template) => {
 setFormInitial({
 name: template.name ||'',
 category: template.category ||'vana',
 model_name: template.model_name ||'',
 ai_step: template.step ||'M1',
 step_number: String(template.step_number ?? 1),
 delay_days: String(template.delay_days ?? 0),
 language: template.language ||'en',
 template_text: template.template_text ||'',
 is_active: template.is_active !== false,
 });
 setEditingId(template.id);
 setShowForm(true);
 // Scroll to top of form
 setTimeout(() => document.getElementById('tmpl-form-anchor')?.scrollIntoView({ behavior:'smooth', block:'start' }), 50);
 };

 const handleSave = (payload) => {
 if (editingId) {
 updateMutation.mutate({ id: editingId, payload });
 } else {
 createMutation.mutate(payload);
 }
 };

 const handleDelete = (id) => {
 if (!window.confirm('Delete this template? This cannot be undone.')) return;
 deleteMutation.mutate(id);
 };

 // Group templates by category so SequenceBar can show siblings
 const siblingsByCategory = useMemo(() => {
 const map = {};
 templates.forEach(t => {
 const cat = t.category ||'vana';
 if (!map[cat]) map[cat] = [];
 map[cat].push(t);
 });
 return map;
 }, [templates]);

 // Filter list
 const filteredTemplates = useMemo(() => {
 const rows = filterCat ==='all'
 ? templates
 : templates.filter(t => (t.category ||'vana') === filterCat);
 return [...rows].sort((a, b) => {
 // Sort within each category by step_number
 const catA = a.category ||'vana', catB = b.category ||'vana';
 if (catA !== catB) return catA.localeCompare(catB);
 return toInt(a.step_number, 1) - toInt(b.step_number, 1);
 });
 }, [templates, filterCat]);

 // Count per tab for filter pills
 const countByTab = useMemo(() => {
 const counts = { all: templates.length };
 TAB_OPTIONS.forEach(t => {
 counts[t.value] = templates.filter(tmpl => (tmpl.category ||'vana') === t.value).length;
 });
 return counts;
 }, [templates]);

 const isSaving = createMutation.isPending || updateMutation.isPending;

 return (
 <div className="flex-1 overflow-y-auto px-4 pb-24 pt-3">
 {/* Form anchor for scroll */}
 <div id="tmpl-form-anchor" />

 {/* Create / Edit form — shown at top when open */}
 {showForm && (
 <div className="mb-4">
 <TemplateForm
 editingId={editingId}
 initialForm={formInitial}
 onSave={handleSave}
 onCancel={closeForm}
 isSaving={isSaving}
 />
 </div>
 )}

 {/* Template list card */}
 <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

 {/* Header */}
 <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
 <div className="flex items-center gap-2">
 <FileText className="w-4 h-4 text-gray-400" />
 <h2 className="font-medium text-sm text-gray-900">Templates</h2>
 <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
 {templates.length}
 </span>
 </div>
 {!showForm && (
 <UIButton
 onClick={() => { setShowForm(true); setEditingId(null); setFormInitial(EMPTY_FORM); }}
 className="h-8 rounded-xl bg-gray-900 hover:bg-gray-700 text-xs gap-1.5 px-3"
 >
 <Plus className="w-3.5 h-3.5" /> New template
 </UIButton>
 )}
 </div>

 {/* Filter pills */}
 <div className="flex gap-2 px-4 py-2.5 overflow-x-auto border-b border-gray-50">
 <FilterPill value="all" label="All" count={countByTab.all} active={filterCat==='all'} onClick={()=>setFilterCat('all')} />
 {TAB_OPTIONS.map(t => (
 <FilterPill key={t.value} value={t.value} label={t.label} count={countByTab[t.value]} active={filterCat===t.value} onClick={()=>setFilterCat(t.value)} />
 ))}
 </div>

 {/* Help banner — shows only when there are no templates */}
 {!isLoading && templates.length === 0 && (
 <div className="m-4 rounded-xl bg-blue-50 border border-blue-200 p-4">
 <p className="text-sm font-medium text-blue-800 mb-1">No templates yet</p>
 <p className="text-xs text-blue-600 leading-relaxed">
 Create a template for each tab (VNA, Match Stock, Green Forms, AI Leads). Add one per message step — e.g. M1 on day 0, M2 on day 3. The buttons in each lead card will appear in that order.
 </p>
 </div>
 )}

 {/* Template list */}
 <div className="p-4 space-y-3">
 {isLoading && (
 <div className="space-y-3">
 {[1,2,3].map(i => (
 <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
 ))}
 </div>
 )}

 {!isLoading && filteredTemplates.length === 0 && templates.length > 0 && (
 <p className="text-center text-sm text-gray-400 py-6">
 No templates in this tab yet
 </p>
 )}

 {filteredTemplates.map(template => (
 <TemplateCard
 key={template.id}
 template={template}
 siblings={siblingsByCategory[template.category ||'vana']}
 onEdit={handleEdit}
 onDelete={handleDelete}
 isDeleting={deleteMutation.isPending}
 />
 ))}
 </div>
 </div>
 </div>
 );
}