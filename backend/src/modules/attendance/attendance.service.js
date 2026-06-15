import prisma from '../../config/db.js';
import createError from '../../utils/createError.js';

const attendanceStatuses = new Set(['present', 'absent']);

const cleanText = (value) => {
  if (typeof value === 'undefined' || value === null) return null;

  const text = String(value).trim();
  return text || null;
};

const toMoneyNumber = (value) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const dateKey = (date) => date.toISOString().slice(0, 10);

const normalizeDateOnly = (value = null) => {
  const text = cleanText(value);

  if (text && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Date(`${text}T00:00:00.000Z`);
  }

  const source = text ? new Date(text) : new Date();
  if (Number.isNaN(source.getTime())) {
    throw createError('Attendance date is invalid', 400);
  }

  return new Date(Date.UTC(source.getFullYear(), source.getMonth(), source.getDate()));
};

const parseCheckInAt = (value, attendanceDate, fallback = null) => {
  const text = cleanText(value);
  if (!text) return fallback;

  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) {
    const [hours, minutes, seconds = '00'] = text.split(':');
    const date = new Date(attendanceDate);
    date.setHours(Number(hours), Number(minutes), Number(seconds), 0);

    if (Number.isNaN(date.getTime())) {
      throw createError('Check-in time is invalid', 400);
    }

    return date;
  }

  const parsedDate = new Date(text);
  if (Number.isNaN(parsedDate.getTime())) {
    throw createError('Check-in time is invalid', 400);
  }

  return parsedDate;
};

const workingDaysInMonth = (attendanceDate) => {
  const year = attendanceDate.getUTCFullYear();
  const month = attendanceDate.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  let workingDays = 0;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const current = new Date(Date.UTC(year, month, day));
    if (current.getUTCDay() !== 5) {
      workingDays += 1;
    }
  }

  return workingDays || daysInMonth || 1;
};

const dailyDeductionForEmployee = (employee, attendanceDate) => {
  const salary = toMoneyNumber(employee?.salary);
  if (salary <= 0) return 0;

  return roundMoney(salary / workingDaysInMonth(attendanceDate));
};

const addAttendanceAliases = (record) => {
  if (!record) return null;

  return {
    ...record,
    employee_id: record.employeeId,
    attendance_date: record.attendanceDate,
    check_in_at: record.checkInAt,
    deduction_amount: record.deductionAmount,
    deduction_transaction_id: record.deductionTransactionId,
    created_by: record.createdBy,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
};

const decorateEmployeeAttendance = (employee, attendance, attendanceDate) => {
  const attendanceRecord = addAttendanceAliases(attendance);
  const status = attendanceRecord?.status || 'unmarked';
  const dailyDeduction = dailyDeductionForEmployee(employee, attendanceDate);
  const deductionAmount =
    status === 'absent' ? toMoneyNumber(attendanceRecord?.deductionAmount || dailyDeduction) : 0;

  return {
    ...employee,
    employee_id: employee.id,
    employee_code: employee.employeeCode,
    attendance: attendanceRecord,
    attendance_id: attendanceRecord?.id || null,
    attendance_status: status,
    attendance_date: attendanceRecord?.attendanceDate || attendanceDate,
    check_in_at: attendanceRecord?.checkInAt || null,
    daily_deduction: dailyDeduction,
    deduction_amount: deductionAmount,
    finalized: Boolean(attendanceRecord?.finalized),
  };
};

const loadEmployeeForAttendance = async (client, employeeId) => {
  const employee = await client.employee.findUnique({
    where: { id: employeeId },
  });

  if (!employee) {
    throw createError('Employee not found', 404);
  }

  if (employee.status !== 'active') {
    throw createError('Only active employees can be marked for attendance', 400);
  }

  return employee;
};

const clearLinkedDeduction = async (client, attendance) => {
  if (!attendance?.deductionTransactionId) return;

  await client.employeeSalaryTransaction.deleteMany({
    where: { id: attendance.deductionTransactionId },
  });
};

const applyAbsenceDeduction = async (client, attendance, employee, attendanceDate, createdBy) => {
  const amount = dailyDeductionForEmployee(employee, attendanceDate);

  if (amount <= 0) {
    await clearLinkedDeduction(client, attendance);

    return client.employeeAttendance.update({
      where: { id: attendance.id },
      data: {
        deductionAmount: 0,
        deductionTransactionId: null,
      },
    });
  }

  const note = `Absence deduction for ${dateKey(attendanceDate)}`;
  let deductionTransactionId = attendance.deductionTransactionId;

  if (deductionTransactionId) {
    await client.employeeSalaryTransaction.update({
      where: { id: deductionTransactionId },
      data: {
        amount,
        transactionDate: attendanceDate,
        notes: attendance.notes ? `${note}: ${attendance.notes}` : note,
      },
    });
  } else {
    const deduction = await client.employeeSalaryTransaction.create({
      data: {
        employeeId: employee.id,
        type: 'deduction',
        amount,
        transactionDate: attendanceDate,
        paymentMethod: null,
        notes: attendance.notes ? `${note}: ${attendance.notes}` : note,
        createdBy: createdBy ? Number(createdBy) : null,
      },
      select: { id: true },
    });
    deductionTransactionId = deduction.id;
  }

  return client.employeeAttendance.update({
    where: { id: attendance.id },
    data: {
      deductionAmount: amount,
      deductionTransactionId,
    },
  });
};

export const listDailyAttendance = async ({ date } = {}) => {
  const attendanceDate = normalizeDateOnly(date);
  const activeEmployees = await prisma.employee.findMany({
    where: { status: 'active' },
    include: {
      attendanceRecords: {
        where: { attendanceDate },
        include: {
          deductionTransaction: {
            select: {
              id: true,
              amount: true,
              transactionDate: true,
              notes: true,
            },
          },
          creator: {
            select: { name: true },
          },
        },
      },
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });

  const employees = activeEmployees.map((employee) => {
    const [attendance] = employee.attendanceRecords || [];
    const { attendanceRecords, ...employeeData } = employee;
    return decorateEmployeeAttendance(employeeData, attendance, attendanceDate);
  });

  const summary = employees.reduce(
    (totals, employee) => {
      if (employee.attendance_status === 'present') totals.present += 1;
      if (employee.attendance_status === 'absent') {
        totals.absent += 1;
        totals.estimated_deduction_total += toMoneyNumber(employee.deduction_amount);
        if (employee.finalized) {
          totals.finalized_deduction_total += toMoneyNumber(employee.deduction_amount);
        }
      }
      if (employee.attendance_status === 'unmarked') totals.unmarked += 1;
      if (employee.finalized) totals.finalized += 1;
      return totals;
    },
    {
      total: employees.length,
      present: 0,
      absent: 0,
      unmarked: 0,
      finalized: 0,
      estimated_deduction_total: 0,
      finalized_deduction_total: 0,
    },
  );

  summary.estimated_deduction_total = roundMoney(summary.estimated_deduction_total);
  summary.finalized_deduction_total = roundMoney(summary.finalized_deduction_total);
  summary.is_finalized = summary.total > 0 && summary.finalized === summary.total;

  return {
    date: dateKey(attendanceDate),
    working_days: workingDaysInMonth(attendanceDate),
    summary,
    employees,
  };
};

export const scanAttendance = async ({ token, date } = {}, createdBy) => {
  const attendanceToken = cleanText(token);
  const attendanceDate = normalizeDateOnly(date);

  if (!attendanceToken) {
    throw createError('Scan an employee barcode first', 400);
  }

  const result = await prisma.$transaction(async (client) => {
    const employee = await client.employee.findFirst({
      where: {
        attendanceToken,
        status: 'active',
      },
    });

    if (!employee) {
      throw createError('Employee barcode was not found', 404);
    }

    const existingAttendance = await client.employeeAttendance.findUnique({
      where: {
        employeeId_attendanceDate: {
          employeeId: employee.id,
          attendanceDate,
        },
      },
    });

    if (existingAttendance?.finalized && existingAttendance.status === 'absent') {
      throw createError('This day is finalized as absent. Edit the row manually to change it.', 400);
    }

    await clearLinkedDeduction(client, existingAttendance);

    const attendance = await client.employeeAttendance.upsert({
      where: {
        employeeId_attendanceDate: {
          employeeId: employee.id,
          attendanceDate,
        },
      },
      create: {
        employeeId: employee.id,
        attendanceDate,
        status: 'present',
        checkInAt: new Date(),
        finalized: false,
        deductionAmount: null,
        deductionTransactionId: null,
        createdBy: createdBy ? Number(createdBy) : null,
      },
      update: {
        status: 'present',
        checkInAt: existingAttendance?.checkInAt || new Date(),
        deductionAmount: null,
        deductionTransactionId: null,
      },
    });

    return decorateEmployeeAttendance(employee, attendance, attendanceDate);
  });

  return {
    employee: result,
    attendance: result.attendance,
  };
};

export const markEmployeeAttendance = async (employeeId, payload = {}, createdBy) => {
  const numericEmployeeId = Number(employeeId);
  const attendanceDate = normalizeDateOnly(payload.date);
  const status = cleanText(payload.status);

  if (!Number.isInteger(numericEmployeeId)) {
    throw createError('Invalid employee id', 400);
  }

  if (!attendanceStatuses.has(status)) {
    throw createError('Attendance status is invalid', 400);
  }

  const result = await prisma.$transaction(async (client) => {
    const employee = await loadEmployeeForAttendance(client, numericEmployeeId);
    const existingAttendance = await client.employeeAttendance.findUnique({
      where: {
        employeeId_attendanceDate: {
          employeeId: numericEmployeeId,
          attendanceDate,
        },
      },
    });

    const finalized = Boolean(existingAttendance?.finalized);
    const checkInAt =
      status === 'present'
        ? parseCheckInAt(payload.check_in_time ?? payload.checkInAt, attendanceDate, existingAttendance?.checkInAt || new Date())
        : null;

    if (status === 'present') {
      await clearLinkedDeduction(client, existingAttendance);
    }

    let attendance = await client.employeeAttendance.upsert({
      where: {
        employeeId_attendanceDate: {
          employeeId: numericEmployeeId,
          attendanceDate,
        },
      },
      create: {
        employeeId: numericEmployeeId,
        attendanceDate,
        status,
        checkInAt,
        notes: cleanText(payload.notes),
        finalized,
        deductionAmount: null,
        deductionTransactionId: null,
        createdBy: createdBy ? Number(createdBy) : null,
      },
      update: {
        status,
        checkInAt,
        notes: cleanText(payload.notes),
        deductionAmount: status === 'present' ? null : existingAttendance?.deductionAmount,
        deductionTransactionId: status === 'present' ? null : existingAttendance?.deductionTransactionId,
      },
    });

    if (status === 'absent' && finalized) {
      attendance = await applyAbsenceDeduction(client, attendance, employee, attendanceDate, createdBy);
    }

    return decorateEmployeeAttendance(employee, attendance, attendanceDate);
  });

  return {
    employee: result,
    attendance: result.attendance,
  };
};

export const finalizeDailyAttendance = async ({ date } = {}, createdBy) => {
  const attendanceDate = normalizeDateOnly(date);

  await prisma.$transaction(async (client) => {
    const employees = await client.employee.findMany({
      where: { status: 'active' },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    const attendanceRecords = await client.employeeAttendance.findMany({
      where: { attendanceDate },
    });
    const attendanceByEmployee = new Map(
      attendanceRecords.map((attendance) => [attendance.employeeId, attendance]),
    );

    for (const employee of employees) {
      const existingAttendance = attendanceByEmployee.get(employee.id);
      let attendance = existingAttendance;

      if (!attendance) {
        attendance = await client.employeeAttendance.create({
          data: {
            employeeId: employee.id,
            attendanceDate,
            status: 'absent',
            checkInAt: null,
            notes: null,
            finalized: true,
            createdBy: createdBy ? Number(createdBy) : null,
          },
        });
      }

      if (attendance.status === 'present') {
        await clearLinkedDeduction(client, attendance);
        await client.employeeAttendance.update({
          where: { id: attendance.id },
          data: {
            finalized: true,
            deductionAmount: null,
            deductionTransactionId: null,
          },
        });
        continue;
      }

      attendance = await client.employeeAttendance.update({
        where: { id: attendance.id },
        data: {
          status: 'absent',
          checkInAt: null,
          finalized: true,
        },
      });

      await applyAbsenceDeduction(client, attendance, employee, attendanceDate, createdBy);
    }
  });

  return listDailyAttendance({ date: dateKey(attendanceDate) });
};
