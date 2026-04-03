// @ts-nocheck
import { supabase } from '@/api/supabaseClient';

const OPERATIONAL_ENTITY_TABLES = {
  AILead: 'ai_leads',
  GreenFormSubmittedLead: 'greenform_submitted_leads',
  ShowroomWalkin: 'showroom_walkins',
  IVRLead: 'ivr_leads',
  VNAStock: 'vna_stock',
  MatchedStockCustomer: 'matched_stock_customers',
  SentMessage: 'sent_messages',
  Template: 'templates',
  LeadNote: 'lead_notes',
  GreenFormClosureRequest: 'greenform_closure_requests',
  Employee: 'employees',
  Role: 'roles'
};

const getEntityTable = (entityName) => {
  return OPERATIONAL_ENTITY_TABLES[entityName];
};

const ENTITY_SORT_COLUMN_MAPS = {
  AILead: {
    created_date: 'created_at',
    updated_date: 'updated_at'
  },

  MatchedStockCustomer: {
  created_date: 'stage_3_date',
  updated_date: 'stock_updated_at'
},

  VNAStock: {
    created_date: 'created_at',
    updated_date: 'updated_at'
  },
  GreenFormSubmittedLead: {
    created_date: 'created_at'
  }
};

const resolveSortColumn = (resolvedEntityName, column) => {
  const entityMap = ENTITY_SORT_COLUMN_MAPS[resolvedEntityName];
  if (entityMap) return entityMap[column] ?? column;
  return column;
};

const applySort = (query, sort, entityName) => {
  if (!sort || typeof sort !== 'string') return query;
  const descending = sort.startsWith('-');
  const rawColumn = descending ? sort.slice(1) : sort;
  const column = resolveSortColumn(entityName, rawColumn);
  if (!column) return query;
  return query.order(column, { ascending: !descending });
};

const normalizeSingle = (payload, rows) => {
  if (Array.isArray(payload)) return rows;
  if (!rows) return null;
  return Array.isArray(rows) ? (rows[0] ?? null) : rows;
};

const throwIfError = (error) => {
  if (!error) return;
  throw error;
};

const normalizeNullable = (value) => (value === undefined ? null : value);

const buildEmployeeFullName = (employee) => {
  if (!employee) return null;
  const firstName = String(employee.first_name ?? '').trim();
  const lastName = String(employee.last_name ?? '').trim();
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  return fullName || null;
};

const getMapKey = (value) => {
  if (value === null || value === undefined) return null;
  return String(value);
};

const normalizeAILeadReadRow = (row, employeeById = new Map()) => {
  const safe = row ?? {};
  const salespersonId = normalizeNullable(safe.salesperson_id);
  const employee = employeeById.get(getMapKey(salespersonId));
  const fullName = buildEmployeeFullName(employee);

  return {
    id: normalizeNullable(safe.id),
    customer_name: normalizeNullable(safe.customer_name),
    mobile_number: normalizeNullable(safe.mobile_number),
    model_name: normalizeNullable(safe.model_name),
    salesperson_id: salespersonId,
    location_id: normalizeNullable(safe.location_id),
    source_conversation_id: normalizeNullable(safe.source_conversation_id),
    conversation_summary: normalizeNullable(safe.conversation_summary),
    conversation_transcript: normalizeNullable(safe.conversation_transcript),
    remarks: normalizeNullable(safe.remarks),
    lead_source: normalizeNullable(safe.lead_source),
    greenform_requested: normalizeNullable(safe.greenform_requested),
    lead_disposition: normalizeNullable(safe.lead_disposition),
    opty_id: normalizeNullable(safe.opty_id),
    opty_status: normalizeNullable(safe.opty_status),
    opty_submitted_at: normalizeNullable(safe.opty_submitted_at),
    created_at: normalizeNullable(safe.created_at),
    updated_at: normalizeNullable(safe.updated_at),

    // Compatibility fields for existing web UI during migration.
    phone_number: normalizeNullable(safe.mobile_number),
    car_of_interest: normalizeNullable(safe.model_name),
    chat_details: normalizeNullable(safe.remarks),
    assigned_to: salespersonId,
    is_assigned: Boolean(salespersonId),
    status: normalizeNullable(safe.opty_status),
    created_date: normalizeNullable(safe.created_at),
    ca_name: fullName,
    employee_full_name: fullName
  };
};

const normalizeVNAStockReadRow = (row) => {
  const safe = row ?? {};

  const id = normalizeNullable(safe.id);
  const customerName = normalizeNullable(safe.customer_name);
  const phoneNumber = normalizeNullable(safe.phone_number ?? safe.mobile_number);

  // VNA table uses parent_product_line for model, product_line for variant,
  // product_description for colour, sales_team for the salesperson name.
  // Fall back to legacy field names for backwards compatibility.
  const carModel = normalizeNullable(
    safe.parent_product_line ?? safe.car_model ?? safe.ppl ?? safe.model_name
  );
  const pl = normalizeNullable(
    safe.product_line ?? safe.pl
  );
  const colour = normalizeNullable(
    safe.product_description ?? safe.colour
  );
  const caName = normalizeNullable(
    safe.sales_team ?? safe.ca_name ?? safe.employee_full_name
  );
  const branch = normalizeNullable(safe.branch ?? safe.current_location);
  const allocationStatus = normalizeNullable(safe.allocation_status ?? safe.status ?? safe.opty_status);
  const createdAt = normalizeNullable(safe.created_at ?? safe.created_date);
  const updatedAt = normalizeNullable(safe.updated_at ?? safe.updated_date);

  return {
    ...safe,

    // Canonical runtime shape for active web VNA tab.
    id,
    customer_name: customerName,
    phone_number: phoneNumber,
    car_model: carModel,
    ca_name: caName,
    branch,
    allocation_status: allocationStatus,
    chassis_no: normalizeNullable(safe.chassis_no),
    colour,
    created_at: createdAt,
    updated_at: updatedAt,

    // Canonical variable names used by fillPlaceholders in LeadCard.
    ppl: carModel,
    pl,

    // Compatibility projection kept for shared-card safety.
    mobile_number: phoneNumber,
    created_date: createdAt,
    updated_date: updatedAt,
    status: normalizeNullable(safe.status ?? allocationStatus)
  };
};

const normalizeVNAStockReadRows = (rows) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  return safeRows.map((row) => normalizeVNAStockReadRow(row));
};

const normalizeVNAStockResult = (result) => {
  if (!result) return null;
  if (Array.isArray(result)) {
    return normalizeVNAStockReadRows(result);
  }
  return normalizeVNAStockReadRow(result);
};

// ─── Match Stock normalizer ──────────────────────────────────────────────────
// matched_stock_customers uses first_name+last_name for customer, sales_team
// for CA name, parent_product_line for model, product_line for variant,
// product_description for colour.
const normalizeMatchedStockReadRow = (row) => {
  const safe = row ?? {};

  // Build customer_name from first_name + last_name (with fallback to customer_name)
  const firstName = String(safe.first_name ?? '').trim();
  const lastName = String(safe.last_name ?? '').trim();
  const customerName = normalizeNullable(
    (firstName || lastName)
      ? [firstName, lastName].filter(Boolean).join(' ')
      : safe.customer_name
  );

  const phoneNumber = normalizeNullable(safe.mobile_number ?? safe.phone_number);
  const carModel = normalizeNullable(safe.parent_product_line ?? safe.car_model ?? safe.ppl ?? safe.model_name);
  const pl = normalizeNullable(safe.product_line ?? safe.pl);
  const colour = normalizeNullable(safe.product_description ?? safe.colour);
  const caName = normalizeNullable(safe.sales_team ?? safe.ca_name ?? safe.employee_full_name);
  const createdAt = normalizeNullable(safe.stage_3_date ?? safe.created_at);

  return {
    ...safe,
    customer_name: customerName,
    phone_number: phoneNumber,
    mobile_number: phoneNumber,
    car_model: carModel,
    ppl: carModel,
    pl,
    colour,
    ca_name: caName,
    chassis_no: normalizeNullable(safe.chassis_no ?? safe.original_chassis_no),
    created_at: createdAt,
    created_date: createdAt,
  };
};

const normalizeMatchedStockReadRows = (rows) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  return safeRows.map((row) => normalizeMatchedStockReadRow(row));
};

const parseCompositeLeadId = (id) => {
  if (id === null || id === undefined) {
    return { source_type: null, source_record_id: null };
  }

  const raw = String(id);
  const splitIndex = raw.indexOf(':');
  if (splitIndex <= 0 || splitIndex >= raw.length - 1) {
    return { source_type: null, source_record_id: null };
  }

  return {
    source_type: raw.slice(0, splitIndex),
    source_record_id: raw.slice(splitIndex + 1)
  };
};

const normalizeGreenFormReadRow = (row) => {
  const safe = row ?? {};
  const parsedFromId = parseCompositeLeadId(safe.id);

  const sourceType = normalizeNullable(safe.source_type ?? parsedFromId.source_type);
  const sourceRecordId = normalizeNullable(safe.source_record_id ?? parsedFromId.source_record_id);
  const customerName = normalizeNullable(safe.customer_name);
  const mobileNumber = normalizeNullable(safe.mobile_number ?? safe.phone_number);
  const modelName = normalizeNullable(safe.model_name ?? safe.car_model ?? safe.ppl);
  const salespersonId = normalizeNullable(safe.salesperson_id ?? safe.assigned_to);
  const locationId = normalizeNullable(safe.location_id);
  const optyId = normalizeNullable(safe.opty_id);
  const optyStatus = normalizeNullable(safe.opty_status ?? safe.status);
  const optySubmittedAt = normalizeNullable(safe.opty_submitted_at);
  const createdAt = normalizeNullable(safe.created_at ?? safe.created_date);
  const employeeFullName = normalizeNullable(safe.employee_full_name ?? safe.ca_name);

  return {
    ...safe,

    // Canonical runtime shape for Green Forms
    source_type: sourceType,
    source_record_id: sourceRecordId,
    customer_name: customerName,
    mobile_number: mobileNumber,
    model_name: modelName,
    salesperson_id: salespersonId,
    location_id: locationId,
    opty_id: optyId,
    opty_status: optyStatus,
    opty_submitted_at: optySubmittedAt,
    created_at: createdAt,

    // Compatibility projection kept for active web UI safety during migration.
    phone_number: mobileNumber,
    car_model: modelName,
    ppl: modelName,
    assigned_to: salespersonId,
    status: optyStatus,
    created_date: createdAt,
    employee_full_name: employeeFullName,
    ca_name: employeeFullName,
    source_pv: normalizeNullable(safe.source_pv ?? sourceType),
    lead_source: normalizeNullable(safe.lead_source ?? sourceType)
  };
};

const normalizeGreenFormReadRows = (rows) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  return safeRows.map((row) => normalizeGreenFormReadRow(row));
};

const normalizeGreenFormResult = (result) => {
  if (!result) return null;
  if (Array.isArray(result)) {
    return normalizeGreenFormReadRows(result);
  }
  return normalizeGreenFormReadRow(result);
};

const fetchEmployeesByIds = async (salespersonIds) => {
  const ids = Array.from(
    new Set(
      (salespersonIds ?? [])
        .filter((id) => id !== null && id !== undefined)
        .map((id) => String(id))
    )
  );

  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from('employees')
    .select('id, first_name, last_name, email, location_id')
    .in('id', ids);

  throwIfError(error);

  const byId = new Map();
  (data ?? []).forEach((employee) => {
    byId.set(getMapKey(employee?.id), employee);
  });

  return byId;
};

const normalizeAILeadReadRows = async (rows) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const salespersonIds = safeRows.map((row) => row?.salesperson_id);
  const employeeById = await fetchEmployeesByIds(salespersonIds);
  return safeRows.map((row) => normalizeAILeadReadRow(row, employeeById));
};

const normalizeAILeadWriteRow = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }

  const normalized = { ...payload };

  if (!('mobile_number' in normalized) && 'phone_number' in normalized) {
    normalized.mobile_number = normalized.phone_number;
  }
  if (!('model_name' in normalized) && 'car_of_interest' in normalized) {
    normalized.model_name = normalized.car_of_interest;
  }
  if (!('remarks' in normalized) && 'chat_details' in normalized) {
    normalized.remarks = normalized.chat_details;
  }
  if (!('salesperson_id' in normalized) && 'assigned_to' in normalized) {
    normalized.salesperson_id = normalized.assigned_to ?? null;
  }
  if (!('opty_status' in normalized) && 'status' in normalized) {
    normalized.opty_status = normalized.status;
  }
  if (!('created_at' in normalized) && 'created_date' in normalized) {
    normalized.created_at = normalized.created_date;
  }
  if (!('updated_at' in normalized) && 'updated_date' in normalized) {
    normalized.updated_at = normalized.updated_date;
  }

  delete normalized.phone_number;
  delete normalized.car_of_interest;
  delete normalized.chat_details;
  delete normalized.assigned_to;
  delete normalized.is_assigned;
  delete normalized.status;
  delete normalized.created_date;
  delete normalized.updated_date;
  delete normalized.ca_name;
  delete normalized.employee_full_name;
  delete normalized.assignment_date;

  return normalized;
};

const normalizeAILeadWritePayload = (payload) => {
  if (Array.isArray(payload)) {
    return payload.map((item) => normalizeAILeadWriteRow(item));
  }
  return normalizeAILeadWriteRow(payload);
};

const normalizeAILeadResult = async (result) => {
  if (!result) return null;

  if (Array.isArray(result)) {
    return normalizeAILeadReadRows(result);
  }

  const employeeById = await fetchEmployeesByIds([result.salesperson_id]);
  return normalizeAILeadReadRow(result, employeeById);
};

const buildAILeadGreenFormPayload = () => {
  return {
    greenform_requested: true,
    opty_status: 'pending',
    updated_at: new Date().toISOString()
  };
};

const createEntityAdapter = (entityName) => {
  const table = getEntityTable(entityName);
  if (!table) {
    throw new Error(`Unknown entity: ${entityName}`);
  }

  return {
    list: async (sort, limit) => {
      // If explicit limit, use single query with range
      if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
        let query = supabase.from(table).select('*');
        query = applySort(query, sort, entityName);
        query = query.range(0, limit - 1);
        const { data, error } = await query;
        throwIfError(error);
        const rows = data ?? [];
        if (entityName === 'AILead') {
          return normalizeAILeadReadRows(rows);
        }
        if (entityName === 'VNAStock') {
          return normalizeVNAStockReadRows(rows);
        }
        if (entityName === 'GreenFormSubmittedLead') {
          return normalizeGreenFormReadRows(rows);
        }
        if (entityName === 'MatchedStockCustomer') {
          return normalizeMatchedStockReadRows(rows);
        }
        return rows;
      }

      // No limit: fetch all records by paginating through 1000-row chunks
      const pageSize = 1000;
      let allRows = [];
      let offset = 0;

      while (true) {
        let query = supabase.from(table).select('*');
        query = applySort(query, sort, entityName);
        query = query.range(offset, offset + pageSize - 1);
        const { data, error } = await query;
        throwIfError(error);

        const rows = data ?? [];
        if (rows.length === 0) break;

        allRows = allRows.concat(rows);
        if (rows.length < pageSize) break; // Last page
        offset += pageSize;
      }

      const rows = allRows;
      if (entityName === 'AILead') {
        return normalizeAILeadReadRows(rows);
      }
      if (entityName === 'VNAStock') {
        return normalizeVNAStockReadRows(rows);
      }
      if (entityName === 'GreenFormSubmittedLead') {
        return normalizeGreenFormReadRows(rows);
      }
      if (entityName === 'MatchedStockCustomer') {
        return normalizeMatchedStockReadRows(rows);
      }
      return rows;
    },

    create: async (payload) => {
      const writePayload = entityName === 'AILead'
        ? normalizeAILeadWritePayload(payload)
        : payload;
      const { data, error } = await supabase.from(table).insert(writePayload).select();
      throwIfError(error);
      const result = normalizeSingle(writePayload, data);
      if (entityName === 'AILead') {
        return normalizeAILeadResult(result);
      }
      if (entityName === 'VNAStock') {
        return normalizeVNAStockResult(result);
      }
      if (entityName === 'GreenFormSubmittedLead') {
        return normalizeGreenFormResult(result);
      }
      return result;
    },

    update: async (id, payload) => {
      const writePayload = entityName === 'AILead'
        ? normalizeAILeadWritePayload(payload)
        : payload;
      const { data, error } = await supabase.from(table).update(writePayload).eq('id', id).select();
      throwIfError(error);
      const result = normalizeSingle(writePayload, data);
      if (entityName === 'AILead') {
        return normalizeAILeadResult(result);
      }
      if (entityName === 'VNAStock') {
        return normalizeVNAStockResult(result);
      }
      if (entityName === 'GreenFormSubmittedLead') {
        return normalizeGreenFormResult(result);
      }
      return result;
    },

    requestGreenForm: async (id) => {
      if (entityName !== 'AILead') {
        throw new Error('requestGreenForm is only available for AILead');
      }

      const payload = buildAILeadGreenFormPayload();
      const { data, error } = await supabase.from(table).update(payload).eq('id', id).select();
      throwIfError(error);
      const result = normalizeSingle(payload, data);
      return normalizeAILeadResult(result);
    },

    delete: async (id) => {
      const { data, error } = await supabase.from(table).delete().eq('id', id).select();
      throwIfError(error);
      return data ?? [];
    }
  };
};

const getSafeFilePath = (name) => {
  const timestamp = Date.now();
  const safeName = String(name || 'upload').replace(/[^a-zA-Z0-9_.-]/g, '_');
  return `uploads/${timestamp}-${safeName}`;
};

export const supabaseApi = {
  entities: {
    AILead: createEntityAdapter('AILead'),
    GreenFormSubmittedLead: createEntityAdapter('GreenFormSubmittedLead'),
    ShowroomWalkin: createEntityAdapter('ShowroomWalkin'),
    IVRLead: createEntityAdapter('IVRLead'),
    VNAStock: createEntityAdapter('VNAStock'),
    MatchedStockCustomer: createEntityAdapter('MatchedStockCustomer'),
    Employee: createEntityAdapter('Employee'),
    Role: createEntityAdapter('Role'),
    SentMessage: createEntityAdapter('SentMessage'),
    Template: createEntityAdapter('Template'),
    LeadNote: createEntityAdapter('LeadNote'),
    GreenFormClosureRequest: createEntityAdapter('GreenFormClosureRequest')
  },

  leadNotes: {
    addNote: async (aiLeadId, employeeId, noteType, noteText) => {
      const payload = {
        ai_lead_id: aiLeadId,
        employee_id: employeeId ?? null,
        note_type: noteType,
        note_text: noteText
      };

      const { data, error } = await supabase
        .from('lead_notes')
        .insert(payload)
        .select('*')
        .single();

      throwIfError(error);
      return data;
    },

    getForLead: async (aiLeadId) => {
      const { data, error } = await supabase
        .from('lead_notes')
        .select('*, employee:employees!lead_notes_employee_id_fkey(first_name, last_name)')
        .eq('ai_lead_id', aiLeadId)
        .order('created_at', { ascending: true });

      throwIfError(error);
      return data ?? [];
    }
  },

  functions: {
    invoke: async (name, payload) => {
      const { data, error } = await supabase.functions.invoke(name, {
        body: payload ?? {}
      });
      throwIfError(error);
      return { data };
    }
  },

  users: {
    inviteUser: async (email, role) => {
      const { data, error } = await supabase.functions.invoke('inviteUser', {
        body: { email, role }
      });
      if (error) {
        return { data: null, error };
      }
      return { data };
    }
  },

  storage: {
    uploadFile: async (file, bucket = 'attachments') => {
      const filePath = getSafeFilePath(file?.name);
      const { error } = await supabase.storage.from(bucket).upload(filePath, file, {
        upsert: false
      });
      throwIfError(error);
      const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
      return { file_url: data?.publicUrl || '' };
    }
  },

  walkinFollowup: {
    getQueue: async () => {
      // Fetch showroom_walkins with car and salesperson data
      const { data: allWalkins, error: walkinError } = await supabase
        .from('showroom_walkins')
        .select(`
          *,
          car:car!showroom_walkins_car_id_fkey(name),
          salesperson:employees!showroom_walkins_salesperson_id_fkey(first_name, last_name)
        `);
      
      throwIfError(walkinError);

      // Filter for non-final statuses
      const walkins = (allWalkins ?? []).filter(
        (w) => !['booked', 'lost'].includes(w.followup_status)
      );

      // Fetch call history to get counts and last verdicts.
      // Query in chunks to avoid oversized URL/query-string when queue is large.
      const walkinIds = Array.from(new Set(walkins.map((w) => w.id).filter(Boolean)));
      let callsByWalkin = new Map();

      if (walkinIds.length > 0) {
        const idChunkSize = 200;
        const allCalls = [];

        for (let index = 0; index < walkinIds.length; index += idChunkSize) {
          const idChunk = walkinIds.slice(index, index + idChunkSize);
          const { data: callHistory, error: callError } = await supabase
            .from('walkin_followup_calls')
            .select('walkin_id, verdict, created_at')
            .in('walkin_id', idChunk);

          throwIfError(callError);

          if (Array.isArray(callHistory) && callHistory.length > 0) {
            allCalls.push(...callHistory);
          }
        }

        // Map call history by walkin_id
        allCalls.forEach((call) => {
          if (!callsByWalkin.has(call.walkin_id)) {
            callsByWalkin.set(call.walkin_id, []);
          }
          callsByWalkin.get(call.walkin_id).push(call);
        });
      }

      // Enrich walkins with call count and last verdict
      const enriched = walkins.map((walkin) => {
        const calls = callsByWalkin.get(walkin.id) || [];
        const sortedCalls = [...calls].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const lastCall = sortedCalls[0];
        
        return {
          ...walkin,
          call_count: calls.length,
          last_verdict: lastCall?.verdict ?? null
        };
      });

      // Sort: next_call_date asc (nulls last), then created_at desc
      return enriched.sort((a, b) => {
        if (a.next_call_date === null && b.next_call_date === null) {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        if (a.next_call_date === null) return 1;
        if (b.next_call_date === null) return -1;
        
        const dateCompare = a.next_call_date.localeCompare(b.next_call_date);
        if (dateCompare !== 0) return dateCompare;
        
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    },

    logCall: async (payload) => {
      const { walkin_id, caller_id, verdict, notes, next_call_date, escalate_to_name } = payload;

      // 1. Insert call record
      const { data: callRecord, error: insertError } = await supabase
        .from('walkin_followup_calls')
        .insert({ walkin_id, caller_id, verdict, notes, next_call_date, escalate_to_name })
        .select()
        .single();
      
      throwIfError(insertError);

      // 2. Determine new followup_status from verdict
      let newStatus = 'called';
      if (verdict === 'booked') {
        newStatus = 'booked';
      } else if (verdict === 'not_interested') {
        newStatus = 'not_interested';
      } else if (verdict === 'escalate' || verdict === 'needs_discount') {
        newStatus = 'escalated';
      }

      // 3. Update showroom_walkins
      const { data: updatedWalkin, error: updateError } = await supabase
        .from('showroom_walkins')
        .update({
          followup_status: newStatus,
          last_verdict: verdict,
          next_call_date: next_call_date ?? null
        })
        .eq('id', walkin_id)
        .select()
        .single();
      
      throwIfError(updateError);

      return { call: callRecord, walkin: updatedWalkin };
    },

    getCallHistory: async (walkinId) => {
      const { data, error } = await supabase
        .from('walkin_followup_calls')
        .select('*')
        .eq('walkin_id', walkinId)
        .order('created_at', { ascending: false });
      
      throwIfError(error);
      return data ?? [];
    },

    getManagerStats: async () => {
      // Fetch all showroom_walkins with status and next_call_date
      const { data: allWalkins, error: walkinError } = await supabase
        .from('showroom_walkins')
        .select('followup_status, next_call_date');
      
      throwIfError(walkinError);

      // Count by followup_status
      const statusCounts = {};
      (allWalkins ?? []).forEach((walkin) => {
        const status = walkin.followup_status || 'pending';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });

      // Count overdue (next_call_date < today and status not in ('booked', 'lost'))
      const today = new Date().toISOString().split('T')[0];
      const overdueCount = (allWalkins ?? []).filter((w) => {
        const isNotFinal = !['booked', 'lost'].includes(w.followup_status);
        const isOverdue = w.next_call_date && w.next_call_date < today;
        return isNotFinal && isOverdue;
      }).length;

      return {
        status_counts: statusCounts,
        overdue_count: overdueCount
      };
    }
  }
};