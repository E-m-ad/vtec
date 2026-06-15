import prisma from '../../config/db.js';
import createError from '../../utils/createError.js';

export const listBrands = async ({ search } = {}) => {
  return prisma.brand.findMany({
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

export const getBrandById = async (id) => {
  const brand = await prisma.brand.findUnique({
    where: { id: Number(id) },
  });

  if (!brand) {
    throw createError('Brand not found', 404);
  }

  return brand;
};

export const createBrand = async ({ name, description = null }) => {
  if (!name) {
    throw createError('Brand name is required', 400);
  }

  try {
    return await prisma.brand.create({
      data: {
        name: name.trim(),
        description,
      },
    });
  } catch (error) {
    if (error.code === 'P2002') {
      throw createError('Brand already exists', 409);
    }

    throw error;
  }
};

export const updateBrand = async (id, { name, description }) => {
  const data = {};

  if (typeof name !== 'undefined') data.name = name.trim();
  if (typeof description !== 'undefined') data.description = description;

  try {
    return await prisma.brand.update({
      where: { id: Number(id) },
      data,
    });
  } catch (error) {
    if (error.code === 'P2025') {
      throw createError('Brand not found', 404);
    }

    if (error.code === 'P2002') {
      throw createError('Brand already exists', 409);
    }

    throw error;
  }
};

export const deleteBrand = async (id) => {
  try {
    return await prisma.brand.delete({
      where: { id: Number(id) },
    });
  } catch (error) {
    if (error.code === 'P2025') {
      throw createError('Brand not found', 404);
    }

    throw error;
  }
};
