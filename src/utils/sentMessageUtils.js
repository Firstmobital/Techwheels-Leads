// @ts-nocheck
const VALID_LEAD_SOURCES = new Set(['walkin', 'ivr', 'ai', 'vna', 'matchtalk', 'greenforms']);
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
  greenforms: 'greenforms',
};

const NON_AI_DEFAULT_FOLLOW_UP_DAYS = [1, 2, 5];
const NON_AI_MATCHTALK_FOLLOW_UP_DAYS = [1, 2, 4];

const CATEGORY_ALIASES = {
  vana: ['vana', 'vna'],
  matchtalk: ['matchtalk', 'match_stock', 'match'],
  greenforms: ['greenforms', 'green_forms', 'greenform'],
  ai_leads: ['ai_leads', 'ai-leads', 'ai'],
};

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toCanonicalCategory = (value) => {
  const token = String(value || '').trim().toLowerCase();
  if (!token) return '';
  if (token === 'all' || token === 'general') return token;
  const entry = Object.entries(CATEGORY_ALIASES).find(([, aliases]) => aliases.includes(token));
  return entry ? entry[0] : token;
};

const getDaysSinceFirstSent = (history) => {
  const safeHistory = Array.isArray(history) ? history : [];
  if (safeHistory.length === 0) return null;
  const first = [...safeHistory].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )[0];
  if (!first?.created_at) return null;

  const msPerDay = 24 * 60 * 60 * 1000;
  const diffMs = Date.now() - new Date(first.created_at).getTime();
  return Math.max(0, Math.floor(diffMs / msPerDay));
};

const getLegacyFollowupDays = (tab) => (
  tab === 'matchtalk' ? NON_AI_MATCHTALK_FOLLOW_UP_DAYS : NON_AI_DEFAULT_FOLLOW_UP_DAYS
);

const getRelevantTemplatesForTab = (templates, tab) => {
  const safeTemplates = Array.isArray(templates) ? templates : [];
  return safeTemplates.filter((template) => {
    if (template?.is_active === false) return false;
    const category = toCanonicalCategory(template?.category || template?.source || '');
    return category === tab || category === 'all' || category === 'general';
  });
};

export const getNonAIFollowupState = (history, tab, templates) => {
  const safeHistory = Array.isArray(history) ? history : [];
  const relevantTemplates = getRelevantTemplatesForTab(templates, tab);
  const sentCount = safeHistory.length;

  const normalizedTemplates = relevantTemplates
    .filter((template) => template?.step_number !== null && template?.step_number !== undefined)
    .map((template, index) => ({
      ...template,
      step_number: Math.max(1, toInt(template?.step_number, index + 1)),
      delay_days: Math.max(0, toInt(template?.delay_days, 0)),
    }))
    .sort((a, b) => {
      if (a.step_number !== b.step_number) return a.step_number - b.step_number;
      return a.delay_days - b.delay_days;
    });

  if (normalizedTemplates.length === 1) {
    const isDone = sentCount >= 1;
    return {
      mode: 'single',
      sentCount,
      totalSteps: 1,
      isDone,
      nextStep: isDone ? null : 1,
      daysUntil: isDone ? null : 0,
      overdue: false,
      overdueDays: 0,
    };
  }

  if (normalizedTemplates.length >= 2) {
    const totalSteps = normalizedTemplates.length;
    const isDone = sentCount >= totalSteps;
    if (isDone) {
      return {
        mode: 'sequence',
        sentCount,
        totalSteps,
        isDone: true,
        nextStep: null,
        daysUntil: null,
        overdue: false,
        overdueDays: 0,
      };
    }

    if (sentCount === 0) {
      return {
        mode: 'sequence',
        sentCount,
        totalSteps,
        isDone: false,
        nextStep: Math.max(1, toInt(normalizedTemplates[0]?.step_number, 1)),
        daysUntil: 0,
        overdue: false,
        overdueDays: 0,
      };
    }

    const nextTemplate = normalizedTemplates[sentCount];
    const nextDelay = Math.max(0, toInt(nextTemplate?.delay_days, 0));
    const daysSinceFirst = getDaysSinceFirstSent(safeHistory);
    const dueNow = daysSinceFirst !== null && daysSinceFirst >= nextDelay;
    const overdue = daysSinceFirst !== null && daysSinceFirst > nextDelay;

    return {
      mode: 'sequence',
      sentCount,
      totalSteps,
      isDone: false,
      nextStep: Math.max(1, toInt(nextTemplate?.step_number, sentCount + 1)),
      daysUntil: dueNow ? 0 : Math.max(nextDelay - (daysSinceFirst ?? 0), 0),
      overdue,
      overdueDays: overdue ? Math.max((daysSinceFirst ?? 0) - nextDelay, 0) : 0,
    };
  }

  const legacyDays = getLegacyFollowupDays(tab);
  const totalSteps = legacyDays.length;
  const isDone = sentCount >= totalSteps;
  if (isDone) {
    return {
      mode: 'legacy',
      sentCount,
      totalSteps,
      isDone: true,
      nextStep: null,
      daysUntil: null,
      overdue: false,
      overdueDays: 0,
    };
  }

  const nextStep = legacyDays[sentCount];
  if (sentCount === 0 || nextStep === 1) {
    return {
      mode: 'legacy',
      sentCount,
      totalSteps,
      isDone: false,
      nextStep,
      daysUntil: 0,
      overdue: false,
      overdueDays: 0,
    };
  }

  const daysSinceFirst = getDaysSinceFirstSent(safeHistory);
  const dueNow = daysSinceFirst !== null && daysSinceFirst >= nextStep;
  const overdue = daysSinceFirst !== null && daysSinceFirst > nextStep;

  return {
    mode: 'legacy',
    sentCount,
    totalSteps,
    isDone: false,
    nextStep,
    daysUntil: dueNow ? 0 : Math.max(nextStep - (daysSinceFirst ?? 0), 0),
    overdue,
    overdueDays: overdue ? Math.max((daysSinceFirst ?? 0) - nextStep, 0) : 0,
  };
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
