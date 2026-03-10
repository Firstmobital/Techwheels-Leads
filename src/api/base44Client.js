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
  // Preserve a simple thrown-error contract similar to what the UI expects.
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

const safeRedirect = (url) => {
  if (typeof window === 'undefined') return;
  if (!url || typeof url !== 'string') return;
  window.location.href = url;
};

export const base44 = {
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

  auth: {
    me: async () => {
      const { data, error } = await supabase.auth.getUser();
      throwIfError(error);
      const authUser = data?.user;
      if (!authUser) return null;

      // Merge in profile data so the UI can read `role`/`ca_names`.
      const { data: profile, error: profileError } = await supabase
        .from(ENTITY_TABLES.User)
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();
      throwIfError(profileError);

      return {
        ...(profile ?? {}),
        id: authUser.id,
        email: authUser.email
      };
    },

    updateMe: async (payload) => {
      const { data, error } = await supabase.auth.getUser();
      throwIfError(error);
      const authUser = data?.user;
      if (!authUser) return null;

      const { data: updated, error: updateError } = await supabase
        .from(ENTITY_TABLES.User)
        .update(payload)
        .eq('id', authUser.id)
        .select()
        .maybeSingle();
      throwIfError(updateError);
      return updated ?? null;
    },

    logout: async (redirectUrl) => {
      const { error } = await supabase.auth.signOut();
      throwIfError(error);
      safeRedirect(redirectUrl);
    },

    redirectToLogin: (redirectUrl) => {
      // OAuth / magic-link flow will be wired up later.
      // For now, keep the method present so UI calls don't crash.
      safeRedirect(redirectUrl);
    }
  },

  users: {
    inviteUser: async (email, role) => {
      // Inviting users requires service-role privileges; typically implemented via an Edge Function.
      // Keep this as a best-effort call so the UI doesn't crash during migration.
      const { data, error } = await supabase.functions.invoke('inviteUser', {
        body: { email, role }
      });

      if (error) {
        if (typeof console !== 'undefined') {
          console.warn('inviteUser failed (expected until implemented):', error);
        }
        return { data: null, error };
      }

      return { data };
    }
  }
};
