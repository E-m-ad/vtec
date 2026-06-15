import jwt from 'jsonwebtoken';
import prisma from '../config/db.js';
import { effectivePermissionsForUser, hasPermission } from '../config/permissions.js';
import createError from '../utils/createError.js';

export const authenticate = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      throw createError('Authentication token is required', 401);
    }

    const token = header.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: Number(payload.id) },
      select: {
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
        },
      },
    });

    if (!user || !user.isActive) {
      throw createError('Invalid or inactive user', 401);
    }

    req.user = {
      ...user,
      permissions: effectivePermissionsForUser(user),
    };
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      next(createError('Invalid or expired authentication token', 401));
      return;
    }

    next(error);
  }
};

export const authorizeRoles = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    next(createError('You do not have permission to perform this action', 403));
    return;
  }

  next();
};

export const authorizePermission = (permission) => (req, _res, next) => {
  if (!req.user || !hasPermission(req.user, permission)) {
    next(createError('You do not have permission to perform this action', 403, { permission }));
    return;
  }

  next();
};
