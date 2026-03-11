import React, { createContext, useState, useContext, useEffect } from 'react';
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
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (profileError) {
        throw profileError;
      }

      setUser({ ...(profile || {}), id: authUser.id, email: authUser.email });
      setIsAuthenticated(true);
      setAuthError(null);
    } catch (error) {
      console.error('Failed to hydrate auth user:', error);
      setUser({ id: authUser.id, email: authUser.email });
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

      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      const session = data?.session;
      if (!session?.user) {
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
        setIsLoadingAuth(false);
        return;
      }

      await hydrateUser(session.user);
    } catch (error) {
      console.error('Session check failed:', error);
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_required', message: 'Authentication required' });
      setIsLoadingAuth(false);
    }
  };

  const updateProfile = async (payload) => {
    const userId = user?.id;
    if (!userId) return null;

    const { data, error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', userId)
      .select()
      .maybeSingle();

    if (error) throw error;
    const nextUser = { ...(user || {}), ...(data || payload) };
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
