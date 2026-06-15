CREATE TYPE "EmployeeStatus" AS ENUM ('active', 'inactive', 'on_leave', 'terminated');

CREATE TABLE "employees" (
    "id" SERIAL NOT NULL,
    "employee_code" VARCHAR(80),
    "name" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(40),
    "email" VARCHAR(160),
    "address" TEXT,
    "position" VARCHAR(120),
    "department" VARCHAR(120),
    "salary" DECIMAL(12,2),
    "hire_date" DATE,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employees_employee_code_key" ON "employees"("employee_code");
CREATE UNIQUE INDEX "employees_phone_key" ON "employees"("phone");
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");
CREATE INDEX "employees_name_idx" ON "employees"("name");
CREATE INDEX "employees_status_idx" ON "employees"("status");
