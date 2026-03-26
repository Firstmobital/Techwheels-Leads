import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '@/api/supabaseClient';

const defaultAuthContextValue = {
  authUser: null,
  session: null,
  user: null,
  isAuthenticated: false,
  isLoadingAuth: true,
  authError: null,
  logout: async () => {},
  checkSession: async () => {},
  updateProfile: async () => null,
};

const AuthContext = createContext(defaultAuthContextValue);

export const AuthProvider = ({ children }) => {
  const [authUser, setAuthUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  const setUnauthenticatedState = useCallback(() => {
    setAuthUser(null);
    setSession(null);
    setIsAuthenticated(false);
    setAuthError({ type: 'auth_required', message: 'Authentication required' });
    setIsLoadingAuth(false);
  }, []);

  const logAuthError = useCallback((label, error) => {
    console.error(label, error);
  }, []);

  const setAuthenticatedState = useCallback((nextSession) => {
    const safeSession = nextSession ?? null;
    const nextAuthUser = safeSession?.user ?? null;

    if (!nextAuthUser) {
      setUnauthenticatedState();
      return;
    }

    setSession(safeSession);
    setAuthUser(nextAuthUser);
    setIsAuthenticated(true);
    setAuthError(null);
    setIsLoadingAuth(false);
  }, [setUnauthenticatedState]);

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

      setAuthenticatedState(session);
    } catch (error) {
      const msg = String(error?.message || '').toLowerCase();
      // Expired or missing refresh token — clear everything and go to login
      if (msg.includes('refresh token') || msg.includes('invalid_grant') || error?.status === 400) {
        await supabase.auth.signOut();
        setUnauthenticatedState();
      } else {
        logAuthError('Session check failed:', error);
        setAuthError({ type: 'session_error', message: 'Unable to verify session' });
      }
    } finally {
      setIsLoadingAuth(false);
    }
  }, [logAuthError, setAuthenticatedState, setUnauthenticatedState]);

  useEffect(() => {
    let isMounted = true;

    checkSession();

    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      // Refresh token invalid — clear local session and redirect to login
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' && !session) {
        await supabase.auth.signOut();
        setUnauthenticatedState();
        return;
      }

      if (!session?.user) {
        setUnauthenticatedState();
        return;
      }

      setAuthenticatedState(session);
    });

    return () => {
      isMounted = false;
      data?.subscription?.unsubscribe();
    };
  }, [checkSession, setAuthenticatedState, setUnauthenticatedState]);

  const updateProfile = async () => {
    return authUser;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUnauthenticatedState();
  };

  return (
    <AuthContext.Provider
      value={{
        authUser,
        session,
        user: authUser,
        isAuthenticated,
        isLoadingAuth,
        authError,
        logout,
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