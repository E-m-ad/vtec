import asyncHandler from '../../utils/asyncHandler.js';
import {
  finalizeDailyAttendance,
  listDailyAttendance,
  markEmployeeAttendance,
  scanAttendance,
} from './attendance.service.js';

export const getDailyAttendance = asyncHandler(async (req, res) => {
  const attendance = await listDailyAttendance(req.query);

  res.json({
    success: true,
    data: attendance,
  });
});

export const scan = asyncHandler(async (req, res) => {
  const attendance = await scanAttendance(req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: attendance,
  });
});

export const markEmployee = asyncHandler(async (req, res) => {
  const attendance = await markEmployeeAttendance(req.params.employeeId, req.body, req.user.id);

  res.json({
    success: true,
    data: attendance,
  });
});

export const finalizeDay = asyncHandler(async (req, res) => {
  const attendance = await finalizeDailyAttendance(req.body, req.user.id);

  res.json({
    success: true,
    data: attendance,
  });
});
