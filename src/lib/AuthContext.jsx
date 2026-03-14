import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';

const AUTH_REQUEST_TIMEOUT_MS = 60000;
const HYDRATION_TIMEOUT_MS = 60000;

const withTimeout = async (promise, timeoutMs = AUTH_REQUEST_TIMEOUT_MS, errorMessage = 'Request timed out') => {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
};

const defaultAuthContextValue = {
  user: null,
  isAuthenticated: false,
  isLoadingAuth: true,
  authError: null,
  logout: async () => {},
  navigateToLogin: () => {},
  checkSession: async () => {},
  updateProfile: async () => null,
};

const AuthContext = createContext(defaultAuthContextValue);

const normalizeRoleValue = (roleCode, roleName) => {
  const raw = String(roleCode || roleName || '').trim();
  return raw ? raw.toLowerCase() : null;
};

const buildNormalizedUser = ({ authUser, employee, role }) => {
  const firstName = employee?.first_name ?? null;
  const lastName = employee?.last_name ?? null;
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
  const roleCode = role?.code ?? null;
  const roleName = role?.name ?? null;

  return {
    employeeId: employee?.id ?? null,
    authUserId: authUser?.id ?? null,
    email: employee?.email ?? authUser?.email ?? null,
    firstName,
    lastName,
    fullName,
    roleId: employee?.role_id ?? null,
    roleName,
    roleCode,
    locationId: employee?.location_id ?? null,

    // Compatibility fields for existing web screens during Phase 1.
    id: employee?.id ?? authUser?.id ?? null,
    full_name: fullName,
    role: normalizeRoleValue(roleCode, roleName)
  };
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    checkSession();

    const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
        setIsLoadingAuth(false);
        return;
      }

      await hydrateUser(session.user);
    });

    return () => {
      data?.subscription?.unsubscribe();
    };
  }, []);

  const hydrateUser = async (authUser) => {
    const fallbackUser = buildNormalizedUser({
      authUser,
      employee: null,
      role: null
    });

    try {
      const { data: employee, error: employeeError } = await withTimeout(
        supabase
          .from('employees')
          .select('id, auth_user_id, role_id, location_id, first_name, last_name, email')
          .eq('auth_user_id', authUser.id)
          .maybeSingle(),
        HYDRATION_TIMEOUT_MS,
        'Employee lookup timed out'
      );

      if (employeeError) {
        console.error('Failed to hydrate auth user:', employeeError);
        setUser(fallbackUser);
        setIsAuthenticated(true);
        setAuthError(null);
        return;
      }

      let role = null;
      if (employee?.role_id) {
        const { data: roleData, error: roleError } = await withTimeout(
          supabase
            .from('roles')
            .select('id, name, code')
            .eq('id', employee.role_id)
            .maybeSingle(),
          HYDRATION_TIMEOUT_MS,
          'Role lookup timed out'
        );

        if (roleError) {
          console.error('Failed to load role for employee:', roleError);
        } else {
          role = roleData ?? null;
        }
      }

      setUser(buildNormalizedUser({ authUser, employee, role }));
      setIsAuthenticated(true);
      setAuthError(null);
    } catch (error) {
      console.error('Failed to hydrate auth user:', error);
      setUser(fallbackUser);
      setIsAuthenticated(true);
      setAuthError(null);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const checkSession = async () => {
    try {
      setIsLoadingAuth(true);
      setAuthError(null);

      const { data, error } = await withTimeout(
        supabase.auth.getSession(),
        HYDRATION_TIMEOUT_MS,
        'Session check timed out'
      );
      if (error) throw error;

      const session = data?.session;
      if (!session?.user) {
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
        setIsLoadingAuth(false);
        return;
      }

      try {
        await hydrateUser(session.user);
      } catch (error) {
        console.error('Failed to hydrate auth user:', error);
        setUser(buildNormalizedUser({ authUser: session.user, employee: null, role: null }));
        setIsAuthenticated(true);
        setAuthError(null);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Session check failed:', error);
      setAuthError(null);
      setIsLoadingAuth(false);
    }
  };

  const updateProfile = async (payload) => {
    const employeeId = user?.employeeId;
    if (!employeeId) return null;

    const allowedEmployeeFields = ['first_name', 'last_name', 'email', 'location_id', 'role_id'];
    const employeePayload = Object.fromEntries(
      Object.entries(payload || {}).filter(([key]) => allowedEmployeeFields.includes(key))
    );

    if (Object.keys(employeePayload).length === 0) {
      return user;
    }

    const { data: employee, error } = await supabase
      .from('employees')
      .update(employeePayload)
      .eq('id', employeeId)
      .select('id, auth_user_id, role_id, location_id, first_name, last_name, email')
      .maybeSingle();

    if (error) throw error;

    let role = null;
    if (employee?.role_id) {
      const { data: roleData, error: roleError } = await supabase
        .from('roles')
        .select('id, name, code')
        .eq('id', employee.role_id)
        .maybeSingle();

      if (roleError) throw roleError;
      role = roleData ?? null;
    }

    const authUser = {
      id: user?.authUserId ?? null,
      email: user?.email ?? null
    };
    const nextUser = buildNormalizedUser({ authUser, employee, role });
    setUser(nextUser);
    return nextUser;
  };

  const logout = async (shouldRedirect = true) => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAuthenticated(false);
    setAuthError({ type: 'auth_required', message: 'Authentication required' });

    if (shouldRedirect && typeof window !== 'undefined') {
      navigateToLogin();
    }
  };

  const navigateToLogin = () => {
    if (typeof window === 'undefined') return;
    const loginPath = import.meta.env.VITE_LOGIN_PATH || '/login';
    const normalizedPath = loginPath.startsWith('/') ? loginPath : `/${loginPath}`;
    const currentPath = window.location.pathname;

    if (currentPath !== normalizedPath) {
      window.history.pushState({}, '', normalizedPath);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      authError,
      logout,
      navigateToLogin,
      checkSession,
      updateProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
