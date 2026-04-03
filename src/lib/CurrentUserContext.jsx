// @ts-nocheck
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

const defaultCurrentUserContextValue = {
  employee: null,
  role: null,
  currentUser: null,
  isLoadingProfile: true,
  refreshCurrentUser: async () => null,
};

const CurrentUserContext = createContext(defaultCurrentUserContextValue);

const normalizeRoleValue = (roleCode, roleName) => {
  const raw = String(roleCode || roleName || '').trim();
  return raw ? raw.toLowerCase() : null;
};

const buildCurrentUser = ({ authUser, employee, role }) => {
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

    // Compatibility fields currently used by existing screens.
    id: employee?.id ?? authUser?.id ?? null,
    full_name: fullName,
    role: normalizeRoleValue(roleCode, roleName),
    is_super_admin: Boolean(employee?.is_super_admin),
  };
};

const getAuthUserFromContextUser = (contextUser) => {
  const authUserId = contextUser?.authUserId ?? contextUser?.id ?? null;
  if (!authUserId) return null;

  return {
    id: authUserId,
    email: contextUser?.email ?? null,
  };
};

export const CurrentUserProvider = ({ children }) => {
  const { user: authContextUser } = useAuth();

  const [employee, setEmployee] = useState(null);
  const [role, setRole] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  const requestCounterRef = useRef(0);

  const refreshCurrentUser = useCallback(async () => {
    const requestId = ++requestCounterRef.current;
    const authUser = getAuthUserFromContextUser(authContextUser);

    if (!authUser?.id) {
      setEmployee(null);
      setRole(null);
      setCurrentUser(null);
      setIsLoadingProfile(false);
      return null;
    }

    setIsLoadingProfile(true);

    try {
      const { data: employeeData, error: employeeError } = await supabase
        .from('employees')
        .select('id, auth_user_id, role_id, location_id, first_name, last_name, email, is_super_admin')
        .eq('auth_user_id', authUser.id)
        .maybeSingle();

      if (requestCounterRef.current !== requestId) {
        return null;
      }

      if (employeeError) {
        console.error('Failed to load employee profile:', employeeError);
        const fallbackCurrentUser = buildCurrentUser({
          authUser,
          employee: null,
          role: null,
        });
        setEmployee(null);
        setRole(null);
        setCurrentUser(fallbackCurrentUser);
        return fallbackCurrentUser;
      }

      if (!employeeData) {
        const fallbackCurrentUser = buildCurrentUser({
          authUser,
          employee: null,
          role: null,
        });
        setEmployee(null);
        setRole(null);
        setCurrentUser(fallbackCurrentUser);
        return fallbackCurrentUser;
      }

      let roleData = null;
      if (employeeData.role_id) {
        const { data: nextRoleData, error: roleError } = await supabase
          .from('roles')
          .select('id, name, code')
          .eq('id', employeeData.role_id)
          .maybeSingle();

        if (requestCounterRef.current !== requestId) {
          return null;
        }

        if (roleError) {
          console.error('Failed to load role profile:', roleError);
          roleData = null;
        } else {
          roleData = nextRoleData ?? null;
        }
      }

      const nextCurrentUser = buildCurrentUser({
        authUser,
        employee: employeeData,
        role: roleData,
      });

      setEmployee(employeeData);
      setRole(roleData);
      setCurrentUser(nextCurrentUser);
      return nextCurrentUser;
    } catch (error) {
      if (requestCounterRef.current !== requestId) {
        return null;
      }

      console.error('Failed to refresh current user:', error);
      const fallbackCurrentUser = buildCurrentUser({
        authUser,
        employee: null,
        role: null,
      });
      setEmployee(null);
      setRole(null);
      setCurrentUser(fallbackCurrentUser);
      return fallbackCurrentUser;
    } finally {
      if (requestCounterRef.current === requestId) {
        setIsLoadingProfile(false);
      }
    }
  }, [authContextUser]);

  useEffect(() => {
    refreshCurrentUser();
  }, [refreshCurrentUser]);

  const value = useMemo(
    () => ({
      employee,
      role,
      currentUser,
      isLoadingProfile,
      refreshCurrentUser,
    }),
    [employee, role, currentUser, isLoadingProfile, refreshCurrentUser]
  );

  return (
    <CurrentUserContext.Provider value={value}>
      {children}
    </CurrentUserContext.Provider>
  );
};

export const useCurrentUser = () => {
  const context = useContext(CurrentUserContext);
  if (!context) {
    throw new Error('useCurrentUser must be used within a CurrentUserProvider');
  }
  return context;
};
