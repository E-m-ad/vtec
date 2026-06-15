import bcrypt from 'bcryptjs';

import { effectivePermissionsForUser } from '../../config/permissions.js';
import prisma from '../../config/db.js';
import createError from '../../utils/createError.js';
import generateToken from '../../utils/generateToken.js';

const allowedRoles = [
  'admin',
  'manager',
  'cashier',
  'inventory',
  'service_receptionist',
  'service_advisor',
  'service_technician',
  'parts_clerk',
  'qc_inspector',
  'delivery_coordinator',
];
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

const normalizeEmail = (email) => email.trim().toLowerCase();

const formatUser = (user) => {
  if (!user) return user;
  return {
    ...user,
    permissions: effectivePermissionsForUser(user),
    permissions_customized: user.permissionsCustomized,
    userPermissions: undefined,
  };
};

export const registerUser = async ({ name, email, password, role = 'cashier' }) => {
  if (!name || !email || !password) {
    throw createError('Name, email, and password are required', 400);
  }

  if (password.length < 6) {
    throw createError('Password must be at least 6 characters long', 400);
  }

  if (!allowedRoles.includes(role)) {
    throw createError('Invalid user role', 400);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizeEmail(email),
        passwordHash,
        role,
      },
      select: publicUserSelect,
    });

    return {
      user: formatUser(user),
      token: generateToken(user),
    };
  } catch (error) {
    if (error.code === 'P2002') {
      throw createError('A user with this email already exists', 409);
    }

    throw error;
  }
};

export const loginUser = async ({ email, password }) => {
  if (!email || !password) {
    throw createError('Email and password are required', 400);
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
    include: {
      userPermissions: {
        select: {
          permission: true,
        },
        orderBy: {
          permission: 'asc',
        },
      },
    },
  });

  if (!user || !user.isActive) {
    throw createError('Invalid email or password', 401);
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw createError('Invalid email or password', 401);
  }

  delete user.passwordHash;

  return {
    user: formatUser(user),
    token: generateToken(user),
  };
};

export const getCurrentUser = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: Number(userId) },
    select: publicUserSelect,
  });

  if (!user) {
    throw createError('User not found', 404);
  }

  return formatUser(user);
};
