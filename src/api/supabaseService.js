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

const normalizeVNAStockReadRow = (row) => {
  const safe = row ?? {};

  const id = normalizeNullable(safe.id ?? safe.lead_id);
  const customerName = normalizeNullable(safe.customer_name);
  const phoneNumber = normalizeNullable(safe.phone_number ?? safe.mobile_number);
  const carModel = normalizeNullable(safe.car_model ?? safe.ppl ?? safe.model_name);
  const caName = normalizeNullable(safe.ca_name ?? safe.employee_full_name);
  const branch = normalizeNullable(safe.branch);
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
    colour: normalizeNullable(safe.colour),
    created_at: createdAt,
    updated_at: updatedAt,

    // Compatibility projection kept only for current shared-card safety.
    mobile_number: phoneNumber,
    ppl: normalizeNullable(safe.ppl ?? carModel),
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
      let query = supabase.from(table).select('*');
      query = applySort(query, sort, entityName);
      if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
        query = query.range(0, limit - 1);
      }
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
