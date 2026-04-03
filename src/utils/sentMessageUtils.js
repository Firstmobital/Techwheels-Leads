// @ts-nocheck
const VALID_LEAD_SOURCES = new Set(['walkin', 'ivr', 'ai', 'vna', 'matchtalk']);
const AI_FOLLOWUP_STEPS = ['M1', 'M2', 'M3', 'M4'];
const AI_FOLLOWUP_DAY_OFFSETS = {
  M1: 1,
  M2: 2,
  M3: 5,
  M4: 10,
};

const TAB_TO_DEFAULT_SOURCE = {
  ai_leads: 'ai',
  vana: 'vna',
  matchtalk: 'matchtalk',
};

const normalizeLeadSource = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID_LEAD_SOURCES.has(normalized) ? normalized : null;
};

const parseCompositeId = (id) => {
  const raw = String(id || '').trim();
  const splitIndex = raw.indexOf(':');
  if (splitIndex <= 0 || splitIndex >= raw.length - 1) {
    return { source: null, recordId: raw || null };
  }
  return {
    source: normalizeLeadSource(raw.slice(0, splitIndex)),
    recordId: raw.slice(splitIndex + 1),
  };
};

export const getLeadSourceForType = (lead, leadType) => {
  const fromLead = normalizeLeadSource(lead?.source_type || lead?.lead_source);
  if (fromLead) return fromLead;
  return normalizeLeadSource(TAB_TO_DEFAULT_SOURCE[leadType]) || 'walkin';
};

export const getSourceRecordIdForLead = (lead, leadType) => {
  // vna_stock and matched_stock_customers have no id column.
  // Use opportunity_name as the stable natural identifier for both.
  if (leadType === 'vana' || leadType === 'matchtalk') {
    const opportunityName = String(lead?.opportunity_name ?? '').trim();
    return opportunityName || null;
  }

  const explicit = lead?.source_record_id;
  if (explicit !== null && explicit !== undefined && String(explicit).trim()) {
    return String(explicit).trim();
  }

  const parsed = parseCompositeId(lead?.id);
  if (parsed.recordId) return parsed.recordId;

  if (leadType === 'ai_leads' && lead?.id !== null && lead?.id !== undefined) {
    return String(lead.id);
  }

  return lead?.id !== null && lead?.id !== undefined ? String(lead.id) : null;
};

export const buildSentMessageKey = (leadSource, sourceRecordId) => {
  const source = normalizeLeadSource(leadSource);
  const record = String(sourceRecordId || '').trim();
  if (!source || !record) return null;
  return `${source}:${record}`;
};

export const getSentMessageKeyForLead = (lead, leadType) => {
  const leadSource = getLeadSourceForType(lead, leadType);
  const sourceRecordId = getSourceRecordIdForLead(lead, leadType);
  return buildSentMessageKey(leadSource, sourceRecordId);
};

export const getSentMessageKeyForRow = (row) => {
  return buildSentMessageKey(row?.lead_source, row?.source_record_id);
};

export const matchesSentMessageToLead = (row, lead, leadType) => {
  const rowKey = getSentMessageKeyForRow(row);
  const leadKey = getSentMessageKeyForLead(lead, leadType);
  if (!rowKey || !leadKey) return false;
  return rowKey === leadKey;
};

const isValidDate = (value) => {
  return value instanceof Date && !Number.isNaN(value.getTime());
};

const toStartOfDay = (value) => {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (!isValidDate(date)) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const getNextFollowupStep = (lead, sentMessages) => {
  const messages = Array.isArray(sentMessages) ? sentMessages : [];
  const leadMessages = messages.filter((row) => matchesSentMessageToLead(row, lead, 'ai_leads'));
  const completedCount = Math.max(0, Math.min(AI_FOLLOWUP_STEPS.length, leadMessages.length));

  if (completedCount >= AI_FOLLOWUP_STEPS.length) {
    return {
      nextStep: null,
      dueDate: null,
      isDueToday: false,
      isDueNow: false,
      isCompleted: true,
    };
  }

  const nextStep = AI_FOLLOWUP_STEPS[completedCount];
  const offsetDays = AI_FOLLOWUP_DAY_OFFSETS[nextStep];
  const assignedAtDay = toStartOfDay(lead?.assigned_at);

  if (!assignedAtDay) {
    return {
      nextStep,
      dueDate: null,
      isDueToday: false,
      isDueNow: false,
      isCompleted: false,
    };
  }

  const dueDate = addDays(assignedAtDay, offsetDays);
  const today = toStartOfDay(new Date());
  const isDueToday = Boolean(today && dueDate.getTime() === today.getTime());
  const isDueNow = Boolean(today && dueDate.getTime() <= today.getTime());

  return {
    nextStep,
    dueDate,
    isDueToday,
    isDueNow,
    isCompleted: false,
  };
};
