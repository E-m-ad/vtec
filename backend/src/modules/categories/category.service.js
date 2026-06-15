import prisma from '../../config/db.js';
import createError from '../../utils/createError.js';

export const listCategories = async ({ search } = {}) => {
  return prisma.category.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: { name: 'asc' },
  });
};

export const getCategoryById = async (id) => {
  const category = await prisma.category.findUnique({
    where: { id: Number(id) },
  });

  if (!category) {
    throw createError('Category not found', 404);
  }

  return category;
};

export const createCategory = async ({ name, description = null }) => {
  if (!name) {
    throw createError('Category name is required', 400);
  }

  try {
    return await prisma.category.create({
      data: {
        name: name.trim(),
        description,
      },
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw createError('Category already exists', 409);
    }

    throw error;
  }
};

export const updateCategory = async (id, { name, description }) => {
  const data = {};

  if (typeof name !== 'undefined') data.name = name.trim();
  if (typeof description !== 'undefined') data.description = description;

  try {
    return await prisma.category.update({
      where: { id: Number(id) },
      data,
    });
  } catch (error) {
    if (error.code === 'P2025') {
      throw createError('Category not found', 404);
    }

    if (error.code === 'P2002') {
      throw createError('Category already exists', 409);
    }

    throw error;
  }
};

export const deleteCategory = async (id) => {
  try {
    return await prisma.category.delete({
      where: { id: Number(id) },
    });
  } catch (error) {
    if (error.code === 'P2025') {
      throw createError('Category not found', 404);
    }

    throw error;
  }
};
