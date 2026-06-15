import asyncHandler from '../../utils/asyncHandler.js';
import {
  createUserAccount,
  deleteUserAccount,
  getPermissionCatalog,
  listUsers,
  updateUserAccount,
} from './user.service.js';

export const getUsers = asyncHandler(async (req, res) => {
  const users = await listUsers(req.query);

  res.json({
    success: true,
    data: users,
  });
});

export const permissionsCatalog = asyncHandler(async (_req, res) => {
  res.json({
    success: true,
    data: getPermissionCatalog(),
  });
});

export const create = asyncHandler(async (req, res) => {
  const user = await createUserAccount(req.body);

  res.status(201).json({
    success: true,
    data: user,
  });
});

export const update = asyncHandler(async (req, res) => {
  const user = await updateUserAccount(req.params.id, req.body, req.user);

  res.json({
    success: true,
    data: user,
  });
});

export const remove = asyncHandler(async (req, res) => {
  const user = await deleteUserAccount(req.params.id, req.user);

  res.json({
    success: true,
    data: user,
  });
});
