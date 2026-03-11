import { supabase } from '@/api/supabaseClient';

const ENTITY_TABLES = {
  VanaLead: 'vana_leads',
  MatchTalkLead: 'matchtalk_leads',
  GreenFormLead: 'greenform_leads',
  AIGeneratedLead: 'ai_generated_leads',
  SentMessage: 'sent_messages',
  Template: 'templates',
  User: 'profiles'
};

const applySort = (query, sort) => {
  if (!sort || typeof sort !== 'string') return query;
  const descending = sort.startsWith('-');
  const column = descending ? sort.slice(1) : sort;
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

const createEntityAdapter = (entityName) => {
  const table = ENTITY_TABLES[entityName];
  if (!table) {
    throw new Error(`Unknown entity: ${entityName}`);
  }

  return {
    list: async (sort, limit) => {
      let query = supabase.from(table).select('*');
      query = applySort(query, sort);
      if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
        query = query.range(0, limit - 1);
      }
      const { data, error } = await query;
      throwIfError(error);
      return data ?? [];
    },

    create: async (payload) => {
      const { data, error } = await supabase.from(table).insert(payload).select();
      throwIfError(error);
      return normalizeSingle(payload, data);
    },

    update: async (id, payload) => {
      const { data, error } = await supabase.from(table).update(payload).eq('id', id).select();
      throwIfError(error);
      return normalizeSingle(payload, data);
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
    VanaLead: createEntityAdapter('VanaLead'),
    MatchTalkLead: createEntityAdapter('MatchTalkLead'),
    GreenFormLead: createEntityAdapter('GreenFormLead'),
    AIGeneratedLead: createEntityAdapter('AIGeneratedLead'),
    SentMessage: createEntityAdapter('SentMessage'),
    Template: createEntityAdapter('Template'),
    User: createEntityAdapter('User')
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
