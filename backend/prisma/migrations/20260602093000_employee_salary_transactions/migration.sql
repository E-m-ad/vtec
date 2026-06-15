CREATE TYPE "EmployeeSalaryTransactionType" AS ENUM ('salary_payment', 'advance', 'deduction', 'bonus', 'allowance');

CREATE TABLE "employee_salary_transactions" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "type" "EmployeeSalaryTransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "transaction_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payment_method" VARCHAR(60),
    "notes" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_salary_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employee_salary_transactions_employee_id_idx" ON "employee_salary_transactions"("employee_id");
CREATE INDEX "employee_salary_transactions_transaction_date_idx" ON "employee_salary_transactions"("transaction_date");
CREATE INDEX "employee_salary_transactions_type_idx" ON "employee_salary_transactions"("type");

ALTER TABLE "employee_salary_transactions" ADD CONSTRAINT "employee_salary_transactions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_salary_transactions" ADD CONSTRAINT "employee_salary_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
