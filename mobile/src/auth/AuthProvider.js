import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  const hydrateProfile = async (nextSession) => {
    const nextUser = nextSession?.user;
    if (!nextUser) {
      setProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, role, ca_names")
      .eq("id", nextUser.id)
      .maybeSingle();

    if (error) {
      setProfile({
        id: nextUser.id,
        email: nextUser.email,
        role: null,
        ca_names: [],
      });
      return;
    }

    setProfile({
      id: nextUser.id,
      email: nextUser.email,
      role: data?.role ?? null,
      ca_names: Array.isArray(data?.ca_names) ? data.ca_names : [],
    });
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!mounted) return;
        const nextSession = data.session ?? null;
        setSession(nextSession);
        await hydrateProfile(nextSession);
      })
      .finally(() => {
        if (mounted) setIsLoadingAuth(false);
      });

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!mounted) return;
      const safeSession = nextSession ?? null;
      setSession(safeSession);
      await hydrateProfile(safeSession);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: profile,
      isAuthenticated: Boolean(session?.user),
      isLoadingAuth,
      signOut: () => supabase.auth.signOut(),
    }),
    [session, profile, isLoadingAuth]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
