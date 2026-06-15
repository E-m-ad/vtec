ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "permissions_customized" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "user_permissions" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL,
  "permission" VARCHAR(120) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_permissions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_permissions_user_id_permission_key"
  ON "user_permissions"("user_id", "permission");

CREATE INDEX IF NOT EXISTS "user_permissions_permission_idx"
  ON "user_permissions"("permission");
