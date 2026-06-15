CREATE TABLE "cars" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER,
    "plate_number" VARCHAR(40),
    "vin" VARCHAR(80),
    "make" VARCHAR(120) NOT NULL,
    "model" VARCHAR(120) NOT NULL,
    "year" INTEGER,
    "color" VARCHAR(80),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cars_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "sales" ADD COLUMN "car_id" INTEGER;

CREATE UNIQUE INDEX "cars_plate_number_key" ON "cars"("plate_number");
CREATE UNIQUE INDEX "cars_vin_key" ON "cars"("vin");
CREATE INDEX "cars_customer_id_idx" ON "cars"("customer_id");
CREATE INDEX "cars_make_model_idx" ON "cars"("make", "model");
CREATE INDEX "sales_car_id_idx" ON "sales"("car_id");

ALTER TABLE "cars" ADD CONSTRAINT "cars_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "cars"("id") ON DELETE SET NULL ON UPDATE CASCADE;
