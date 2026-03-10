/**
 * Helper to normalize lead data structure
 * Handles both nested data property and flat structure
 */
export function getNormalizedLead(lead) {
  if (!lead) return {};
  // If data property exists, use it; otherwise use lead as-is
  return lead.data || lead;
}

/**
 * Safely get a property from a lead
 */
export function getLeadProperty(lead, prop) {
  const normalized = getNormalizedLead(lead);
  return normalized[prop];
}