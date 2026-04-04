// @ts-nocheck
export const isAdminUser = (user) => {
  if (!user) return false;
  if (user.isSuperAdmin === true || user.is_super_admin === true) return true;

  const roleCode = String(user.roleCode || '').trim().toLowerCase();
  const roleName = String(user.roleName || '').trim().toLowerCase();
  const role = String(user.role || '').trim().toLowerCase();

  return roleCode === 'admin' || roleName === 'admin' || role === 'admin';
};

export const isSalesPerson = (user) => {
  if (!user) return false;
  if (isAdminUser(user)) return false;
  const roleCode = String(user.roleCode || '').trim().toLowerCase();
  const roleName = String(user.roleName || '').trim().toLowerCase();
  return roleCode === 'salesperson' || roleName === 'salesperson';
};

export const isCallingTeam = (user) => {
  if (!user) return false;
  if (isAdminUser(user)) return false;
  const roleCode = String(user.roleCode || '').trim().toLowerCase();
  const roleName = String(user.roleName || '').trim().toLowerCase();
  return roleCode === 'calling_team' || roleName === 'calling_team';
};
