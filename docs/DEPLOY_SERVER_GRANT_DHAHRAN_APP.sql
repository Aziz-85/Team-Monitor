-- Run as postgres on the server so dhahran_app can run Prisma migrations and own new objects.
-- Usage: sudo -u postgres psql -d dhahran_team -f /path/to/this/file.sql

-- 1) Grant privileges
GRANT ALL PRIVILEGES ON SCHEMA public TO dhahran_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO dhahran_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO dhahran_app;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO dhahran_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO dhahran_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO dhahran_app;

-- 2) Transfer ownership so dhahran_app can ALTER types/tables (required for migrations like Role enum)
ALTER SCHEMA public OWNER TO dhahran_app;
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT typname FROM pg_type WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') AND typtype = 'e')
  LOOP EXECUTE format('ALTER TYPE public.%I OWNER TO dhahran_app', r.typname); END LOOP;
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public')
  LOOP EXECUTE format('ALTER TABLE public.%I OWNER TO dhahran_app', r.tablename); END LOOP;
  FOR r IN (SELECT sequencename FROM pg_sequences WHERE schemaname = 'public')
  LOOP EXECUTE format('ALTER SEQUENCE public.%I OWNER TO dhahran_app', r.sequencename); END LOOP;
END $$;
