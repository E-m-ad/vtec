CREATE TABLE "general_expenses" (
  "id" SERIAL NOT NULL,
  "category" VARCHAR(120) NOT NULL,
  "amount" DECIMAL(12, 2) NOT NULL,
  "expense_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payment_method" VARCHAR(60),
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "general_expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "general_expenses_expense_date_idx" ON "general_expenses"("expense_date");
CREATE INDEX "general_expenses_category_idx" ON "general_expenses"("category");
CREATE INDEX "general_expenses_created_by_idx" ON "general_expenses"("created_by");

ALTER TABLE "general_expenses"
  ADD CONSTRAINT "general_expenses_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
