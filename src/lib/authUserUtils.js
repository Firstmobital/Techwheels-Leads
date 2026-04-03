// @ts-nocheck
export const isAdminUser = (user) => {
  if (!user) return false;
  if (user.isSuperAdmin === true || user.is_super_admin === true) return true;

  const roleCode = String(user.roleCode || '').trim().toLowerCase();
  const roleName = String(user.roleName || '').trim().toLowerCase();
  const role = String(user.role || '').trim().toLowerCase();

  return roleCode === 'admin' || roleName === 'admin' || role === 'admin';
};
