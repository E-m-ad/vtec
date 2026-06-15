import bcrypt from 'bcryptjs';

import {
  ALLOWED_ROLES,
  PERMISSION_CATALOG,
  ROLE_CATALOG,
  ROLE_PERMISSION_DEFAULTS,
  effectivePermissionsForUser,
  normalizePermissionList,
  roleDefaultPermissions,
} from '../../config/permissions.js';
import prisma from '../../config/db.js';
import createError from '../../utils/createError.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  permissionsCustomized: true,
  userPermissions: {
    select: {
      permission: true,
    },
    orderBy: {
      permission: 'asc',
    },
  },
  createdAt: true,
  updatedAt: true,
};

const cleanText = (value) => {
  if (typeof value === 'undefined') return undefined;
  if (value === null) return null;

  const text = String(value).trim();
  return text || null;
};

const normalizeEmail = (value) => {
  const email = cleanText(value);

  if (!email || !emailPattern.test(email)) {
    throw createError('Enter a valid email address', 400);
  }

  return email.toLowerCase();
};

const normalizeRole = (value) => {
  const role = cleanText(value) || 'cashier';

  if (!ALLOWED_ROLES.includes(role)) {
    throw createError('Invalid user role', 400);
  }

  return role;
};

const formatUser = (user) => {
  if (!user) return user;
  const permissions = effectivePermissionsForUser(user);
  const defaultPermissions = roleDefaultPermissions(user.role);

  return {
    ...user,
    permissions,
    permissions_customized: user.permissionsCustomized,
    default_permissions: defaultPermissions,
    userPermissions: undefined,
  };
};

const replaceUserPermissions = async (client, userId, permissions) => {
  await client.userPermission.deleteMany({ where: { userId: Number(userId) } });

  if (!permissions.length || permissions.includes('*')) return;

  await client.userPermission.createMany({
    data: permissions.map((permission) => ({
      userId: Number(userId),
      permission,
    })),
    skipDuplicates: true,
  });
};

const permissionsMatchRoleDefault = (role, permissions) => {
  const defaults = roleDefaultPermissions(role);
  if (defaults.includes('*') && permissions.includes('*')) return true;
  if (defaults.length !== permissions.length) return false;

  const permissionSet = new Set(permissions);
  return defaults.every((permission) => permissionSet.has(permission));
};

const assertPermissionScope = (role, permissions) => {
  if (role !== 'admin' && permissions?.includes('*')) {
    throw createError('Full access permissions are reserved for admin accounts', 400);
  }
};

const normalizePermissionsPayload = (payload) => {
  if (!Object.prototype.hasOwnProperty.call(payload, 'permissions') || typeof payload.permissions === 'undefined') return null;

  try {
    return normalizePermissionList(payload.permissions);
  } catch (error) {
    throw createError(error.message || 'Invalid permissions', error.statusCode || 400);
  }
};

const normalizeActive = (value) => {
  if (typeof value === 'undefined') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;

  return Boolean(value);
};

const assertPassword = (password, { required = false } = {}) => {
  const cleanPassword = cleanText(password);

  if (!cleanPassword) {
    if (required) {
      throw createError('Password is required', 400);
    }

    return null;
  }

  if (cleanPassword.length < 6) {
    throw createError('Password must be at least 6 characters long', 400);
  }

  return cleanPassword;
};

const assertAdminAccessCanChange = async (userId) => {
  const target = await prisma.user.findUnique({
    where: { id: Number(userId) },
    select: {
      id: true,
      role: true,
      isActive: true,
    },
  });

  if (!target) {
    throw createError('User not found', 404);
  }

  if (target.role !== 'admin' || !target.isActive) {
    return;
  }

  const activeAdminCount = await prisma.user.count({
    where: {
      role: 'admin',
      isActive: true,
    },
  });

  if (activeAdminCount <= 1) {
    throw createError('At least one active admin account is required', 400);
  }
};

const handleUserError = (error) => {
  if (error.code === 'P2002') {
    throw createError('A user with this email already exists', 409);
  }

  if (error.code === 'P2025') {
    throw createError('User not found', 404);
  }

  throw error;
};

export const listUsers = async ({ search, role, is_active } = {}) => {
  const where = {};
  const normalizedRole = cleanText(role);
  const activeFilter = normalizeActive(is_active);

  if (normalizedRole) {
    if (!ALLOWED_ROLES.includes(normalizedRole)) {
      throw createError('Invalid user role', 400);
    }

    where.role = normalizedRole;
  }

  if (typeof activeFilter !== 'undefined') {
    where.isActive = activeFilter;
  }

  if (search) {
    const query = search.trim();
    where.OR = [
      { name: { contains: query, mode: 'insensitive' } },
      { email: { contains: query, mode: 'insensitive' } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    select: publicUserSelect,
  });

  return users.map(formatUser);
};

export const createUserAccount = async ({ name, email, password, role = 'cashier', is_active = true, permissions }) => {
  const cleanName = cleanText(name);
  if (!cleanName) {
    throw createError('Name is required', 400);
  }

  const normalizedRole = normalizeRole(role);
  const normalizedPermissions = normalizePermissionsPayload({ permissions }, normalizedRole);
  assertPermissionScope(normalizedRole, normalizedPermissions);
  const cleanPassword = assertPassword(password, { required: true });
  const passwordHash = await bcrypt.hash(cleanPassword, 12);

  try {
    const createdUser = await prisma.$transaction(async (client) => {
      const usesRoleDefaults = !normalizedPermissions || permissionsMatchRoleDefault(normalizedRole, normalizedPermissions);
      const user = await client.user.create({
        data: {
          name: cleanName,
          email: normalizeEmail(email),
          passwordHash,
          role: normalizedRole,
          isActive: normalizeActive(is_active) ?? true,
          permissionsCustomized: !usesRoleDefaults,
        },
        select: { id: true },
      });

      if (normalizedPermissions && !usesRoleDefaults) {
        await replaceUserPermissions(client, user.id, normalizedPermissions);
      }

      return client.user.findUnique({
        where: { id: user.id },
        select: publicUserSelect,
      });
    });

    return formatUser(createdUser);
  } catch (error) {
    handleUserError(error);
  }
};

export const updateUserAccount = async (id, payload, currentUser) => {
  const userId = Number(id);
  const data = {};

  if (typeof payload.name !== 'undefined') {
    const name = cleanText(payload.name);
    if (!name) {
      throw createError('Name is required', 400);
    }
    data.name = name;
  }

  if (typeof payload.email !== 'undefined') {
    data.email = normalizeEmail(payload.email);
  }

  if (typeof payload.role !== 'undefined') {
    data.role = normalizeRole(payload.role);
  }

  if (typeof payload.is_active !== 'undefined') {
    data.isActive = normalizeActive(payload.is_active);
  }

  const cleanPassword = assertPassword(payload.password);
  if (cleanPassword) {
    data.passwordHash = await bcrypt.hash(cleanPassword, 12);
  }

  if (data.role && data.role !== 'admin') {
    await assertAdminAccessCanChange(userId);
  }

  if (data.isActive === false) {
    await assertAdminAccessCanChange(userId);
  }

  if (currentUser?.id === userId && data.isActive === false) {
    throw createError('You cannot deactivate your own account', 400);
  }

  try {
    const updatedUser = await prisma.$transaction(async (client) => {
      const existing = await client.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true },
      });
      if (!existing) throw createError('User not found', 404);

      const finalRole = data.role || existing.role;
      const normalizedPermissions = normalizePermissionsPayload(payload, finalRole);
      assertPermissionScope(finalRole, normalizedPermissions);
      if (normalizedPermissions) {
        data.permissionsCustomized = !permissionsMatchRoleDefault(finalRole, normalizedPermissions);
      } else if (data.role) {
        data.permissionsCustomized = false;
      }

      const user = await client.user.update({
        where: { id: userId },
        data,
        select: { id: true },
      });

      if (normalizedPermissions && data.permissionsCustomized) {
        await replaceUserPermissions(client, user.id, normalizedPermissions);
      } else if (normalizedPermissions) {
        await client.userPermission.deleteMany({ where: { userId } });
      } else if (data.role) {
        await client.userPermission.deleteMany({ where: { userId } });
      }

      return client.user.findUnique({
        where: { id: user.id },
        select: publicUserSelect,
      });
    });

    return formatUser(updatedUser);
  } catch (error) {
    handleUserError(error);
  }
};

export const deleteUserAccount = async (id, currentUser) => {
  const userId = Number(id);

  if (currentUser?.id === userId) {
    throw createError('You cannot delete your own account', 400);
  }

  await assertAdminAccessCanChange(userId);

  try {
    const deleted = await prisma.user.delete({
      where: { id: userId },
      select: publicUserSelect,
    });
    return formatUser(deleted);
  } catch (error) {
    handleUserError(error);
  }
};

export const getPermissionCatalog = () => ({
  permissions: PERMISSION_CATALOG,
  roles: ROLE_CATALOG.map((role) => ({
    ...role,
    default_permissions: roleDefaultPermissions(role.value),
  })),
  role_defaults: ROLE_PERMISSION_DEFAULTS,
});
