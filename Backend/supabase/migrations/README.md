This folder contains the current Supabase schema migration for the app.

Use [20251002050955_create_security_attendance_schema.sql](20251002050955_create_security_attendance_schema.sql) to create the current attendance and security tables in Supabase.

The migration defines:

- `profiles`
- `employees`
- `attendance_records`
- `system_logs`

Apply it from the Supabase SQL editor or via the Supabase CLI before pointing the backend at the database.
