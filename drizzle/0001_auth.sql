-- Accounts: credentials for the users table.
-- Nullable so that rows created before this migration (and rows created by the
-- test suite purely to own data) remain valid; a null hash simply cannot match.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" text;
