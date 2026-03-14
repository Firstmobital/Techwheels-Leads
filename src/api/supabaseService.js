import { supabase } from '@/api/supabaseClient';

const OPERATIONAL_ENTITY_TABLES = {
  AILead: 'ai_leads',
  ShowroomWalkin: 'showroom_walkins',
  IVRLead: 'ivr_leads',
  VNAStock: 'vna_stock',
  MatchedStockCustomer: 'matched_stock_customer',
  SentMessage: 'sent_messages',
  Template: 'templates',
  Employee: 'employees',
  Role: 'roles'
};

// Temporary compatibility aliases so existing callers compile during migration.
const LEGACY_ENTITY_ALIASES = {
  VanaLead: 'VNAStock',
  MatchTalkLead: 'MatchedStockCustomer',
  GreenFormLead: 'ShowroomWalkin',
  // Legacy AI alias retained for stale callers; active web AI path uses AILead.
  AIGeneratedLead: 'AILead',
  User: 'Employee'
};

const resolveEntityName = (entityName) => {
  return LEGACY_ENTITY_ALIASES[entityName] ?? entityName;
};

const getEntityTable = (entityName) => {
  const resolved = resolveEntityName(entityName);
  return OPERATIONAL_ENTITY_TABLES[resolved];
};

const AI_LEAD_SORT_COLUMN_MAP = {
  created_date: 'created_at',
  updated_date: 'updated_at'
};

const resolveSortColumn = (resolvedEntityName, column) => {
  if (resolvedEntityName === 'AILead') {
    return AI_LEAD_SORT_COLUMN_MAP[column] ?? column;
  }
  return column;
};

const applySort = (query, sort, resolvedEntityName) => {
  if (!sort || typeof sort !== 'string') return query;
  const descending = sort.startsWith('-');
  const rawColumn = descending ? sort.slice(1) : sort;
  const column = resolveSortColumn(resolvedEntityName, rawColumn);
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
    remarks: normalizeNullable(safe.remarks),
    greenform_requested: normalizeNullable(safe.greenform_requested),
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
  const resolvedEntityName = resolveEntityName(entityName);
  if (!table) {
    throw new Error(`Unknown entity: ${entityName}`);
  }

  return {
    list: async (sort, limit) => {
      let query = supabase.from(table).select('*');
      query = applySort(query, sort, resolvedEntityName);
      if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
        query = query.range(0, limit - 1);
      }
      const { data, error } = await query;
      throwIfError(error);
      const rows = data ?? [];
      if (resolvedEntityName === 'AILead') {
        return normalizeAILeadReadRows(rows);
      }
      return rows;
    },

    create: async (payload) => {
      const writePayload = resolvedEntityName === 'AILead'
        ? normalizeAILeadWritePayload(payload)
        : payload;
      const { data, error } = await supabase.from(table).insert(writePayload).select();
      throwIfError(error);
      const result = normalizeSingle(writePayload, data);
      if (resolvedEntityName === 'AILead') {
        return normalizeAILeadResult(result);
      }
      return result;
    },

    update: async (id, payload) => {
      const writePayload = resolvedEntityName === 'AILead'
        ? normalizeAILeadWritePayload(payload)
        : payload;
      const { data, error } = await supabase.from(table).update(writePayload).eq('id', id).select();
      throwIfError(error);
      const result = normalizeSingle(writePayload, data);
      if (resolvedEntityName === 'AILead') {
        return normalizeAILeadResult(result);
      }
      return result;
    },

    requestGreenForm: async (id) => {
      if (resolvedEntityName !== 'AILead') {
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
    ShowroomWalkin: createEntityAdapter('ShowroomWalkin'),
    IVRLead: createEntityAdapter('IVRLead'),
    VNAStock: createEntityAdapter('VNAStock'),
    MatchedStockCustomer: createEntityAdapter('MatchedStockCustomer'),
    Employee: createEntityAdapter('Employee'),
    Role: createEntityAdapter('Role'),

    // Temporary compatibility exports for existing call sites.
    VanaLead: createEntityAdapter('VanaLead'),
    MatchTalkLead: createEntityAdapter('MatchTalkLead'),
    GreenFormLead: createEntityAdapter('GreenFormLead'),
    User: createEntityAdapter('User'),

    SentMessage: createEntityAdapter('SentMessage'),
    Template: createEntityAdapter('Template')
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
  }
};
