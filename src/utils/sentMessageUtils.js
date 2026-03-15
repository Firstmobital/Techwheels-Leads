const VALID_LEAD_SOURCES = new Set(['walkin', 'ivr', 'ai']);

const TAB_TO_DEFAULT_SOURCE = {
  ai_leads: 'ai',
  vana: 'walkin',
  matchtalk: 'walkin',
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
