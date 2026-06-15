import asyncHandler from '../../utils/asyncHandler.js';
import {
  createCar,
  deleteCar,
  getCarById,
  getCarDetails,
  listCars,
  updateCar,
} from './car.service.js';

export const getCars = asyncHandler(async (req, res) => {
  const cars = await listCars(req.query);

  res.json({
    success: true,
    data: cars,
  });
});

export const getCar = asyncHandler(async (req, res) => {
  const car = await getCarById(req.params.id);

  res.json({
    success: true,
    data: car,
  });
});

export const getDetails = asyncHandler(async (req, res) => {
  const car = await getCarDetails(req.params.id);

  res.json({
    success: true,
    data: car,
  });
});

export const create = asyncHandler(async (req, res) => {
  const car = await createCar(req.body);

  res.status(201).json({
    success: true,
    data: car,
  });
});

export const update = asyncHandler(async (req, res) => {
  const car = await updateCar(req.params.id, req.body);

  res.json({
    success: true,
    data: car,
  });
});

export const remove = asyncHandler(async (req, res) => {
  const car = await deleteCar(req.params.id);

  res.json({
    success: true,
    data: car,
  });
});
