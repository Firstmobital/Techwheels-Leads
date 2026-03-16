import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/api/supabaseClient';

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
    isSuperAdmin: Boolean(employee?.is_super_admin),
    locationId: employee?.location_id ?? null,

    // Compatibility fields for existing web screens during Phase 1.
    id: employee?.id ?? authUser?.id ?? null,
    full_name: fullName,
    role: normalizeRoleValue(roleCode, roleName),
    is_super_admin: Boolean(employee?.is_super_admin),
  };
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  const hydrationInFlightRef = useRef(new Map());
  const latestRequestedAuthUserIdRef = useRef(null);
  const hydratedAuthUserIdRef = useRef(null);

  const setUnauthenticatedState = useCallback(() => {
    latestRequestedAuthUserIdRef.current = null;
    hydratedAuthUserIdRef.current = null;
    setUser(null);
    setIsAuthenticated(false);
    setAuthError({ type: 'auth_required', message: 'Authentication required' });
    setIsLoadingAuth(false);
  }, []);

  const logAuthError = useCallback((label, error) => {
    console.error(label, error);
  }, []);

  const hydrateUser = useCallback(async (authUser) => {
    if (!authUser?.id) {
      setUnauthenticatedState();
      return null;
    }

    const authUserId = String(authUser.id);
    latestRequestedAuthUserIdRef.current = authUserId;

    const existingHydration = hydrationInFlightRef.current.get(authUserId);
    if (existingHydration) {
      return existingHydration;
    }

    const hydrationPromise = (async () => {
      const fallbackUser = buildNormalizedUser({
        authUser,
        employee: null,
        role: null,
      });

      try {
        const { data: employee, error: employeeError } = await supabase
          .from('employees')
          .select('id, auth_user_id, role_id, location_id, first_name, last_name, email, is_super_admin')
          .eq('auth_user_id', authUser.id)
          .maybeSingle();

        if (latestRequestedAuthUserIdRef.current !== authUserId) {
          return null;
        }

        if (employeeError) {
          logAuthError('Failed to hydrate auth user:', employeeError);
          setUser(fallbackUser);
          setIsAuthenticated(true);
          setAuthError(null);
          return fallbackUser;
        }

        let role = null;
        if (employee?.role_id) {
          const { data: roleData, error: roleError } = await supabase
            .from('roles')
            .select('id, name, code')
            .eq('id', employee.role_id)
            .maybeSingle();

          if (roleError) {
            logAuthError('Failed to load role for employee:', roleError);
          } else {
            role = roleData ?? null;
          }
        }

        if (latestRequestedAuthUserIdRef.current !== authUserId) {
          return null;
        }

        const nextUser = buildNormalizedUser({ authUser, employee, role });
        setUser(nextUser);
        setIsAuthenticated(true);
        setAuthError(null);
        return nextUser;
      } catch (error) {
        if (latestRequestedAuthUserIdRef.current !== authUserId) {
          return null;
        }

        logAuthError('Failed to hydrate auth user:', error);
        setUser(fallbackUser);
        setIsAuthenticated(true);
        setAuthError(null);
        return fallbackUser;
      } finally {
        hydrationInFlightRef.current.delete(authUserId);
        if (latestRequestedAuthUserIdRef.current === authUserId) {
          setIsLoadingAuth(false);
        }
      }
    })();

    hydrationInFlightRef.current.set(authUserId, hydrationPromise);
    return hydrationPromise;
  }, [logAuthError, setUnauthenticatedState]);

  const checkSession = useCallback(async () => {
    try {
      setIsLoadingAuth(true);
      setAuthError(null);

      const { data, error } = await supabase.auth.getSession();

      if (error) throw error;

      const session = data?.session;
      if (!session?.user) {
        setUnauthenticatedState();
        return;
      }

      await hydrateUser(session.user);
    } catch (error) {
      logAuthError('Session check failed:', error);
      setAuthError(null);
      setIsLoadingAuth(false);
    }
  }, [hydrateUser, logAuthError, setUnauthenticatedState]);

  useEffect(() => {
    hydratedAuthUserIdRef.current = user?.authUserId ? String(user.authUserId) : null;
  }, [user]);

  useEffect(() => {
    checkSession();

    const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        setUnauthenticatedState();
        return;
      }

      const nextAuthUserId = String(session.user.id);
      const currentHydratedAuthUserId = hydratedAuthUserIdRef.current;
      const shouldShowLoading =
        !currentHydratedAuthUserId || currentHydratedAuthUserId !== nextAuthUserId;

      if (shouldShowLoading) {
        setIsLoadingAuth(true);
      }

      setAuthError(null);
      await hydrateUser(session.user);
    });

    return () => {
      data?.subscription?.unsubscribe();
    };
  }, [checkSession, hydrateUser, setUnauthenticatedState]);

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
      .select('id, auth_user_id, role_id, location_id, first_name, last_name, email, is_super_admin')
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
      email: user?.email ?? null,
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
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        authError,
        logout,
        navigateToLogin,
        checkSession,
        updateProfile,
      }}
    >
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