/**
 * Helper to normalize lead data structure
 */
export function getNormalizedLead(lead) {
  if (!lead) return {};
  return lead;
}

/**
 * Safely get a property from a lead
 */
export function getLeadProperty(lead, prop) {
  const normalized = getNormalizedLead(lead);
  return normalized[prop];
}