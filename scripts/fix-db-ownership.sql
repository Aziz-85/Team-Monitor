-- Transfer ownership of all tables and sequences in public schema to the app user.
-- Required when migrations fail with: must be owner of table (42501)
--
-- Usage (run as postgres superuser):
--   1. Replace YOUR_APP_USER below with the username from DATABASE_URL in .env (e.g. deploy, dhahran_team)
--   2. Run: sudo -u postgres psql -d dhahran_team -f scripts/fix-db-ownership.sql
--
-- Or with sed (replace deploy with your app user):
--   sed 's/YOUR_APP_USER/deploy/g' scripts/fix-db-ownership.sql | sudo -u postgres psql -d dhahran_team -f -

DO $$
DECLARE
  r RECORD;
  app_user TEXT := 'YOUR_APP_USER';
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public')
  LOOP
    EXECUTE format('ALTER TABLE %I OWNER TO %I', r.tablename, app_user);
  END LOOP;
  FOR r IN (SELECT sequencename FROM pg_sequences WHERE schemaname = 'public')
  LOOP
    EXECUTE format('ALTER SEQUENCE %I OWNER TO %I', r.sequencename, app_user);
  END LOOP;
END $$;
