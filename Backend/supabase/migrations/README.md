This folder previously contained a combined security + attendance schema migration that included an `intruder_detections` table.

As of 2025-10-08, the intruder module has been removed from the codebase. The migration file was deleted to avoid confusion.

If you need a fresh schema for attendance-only, create a new migration with just:
- profiles
- employees
- attendance_records
- system_logs

You can generate a new migration using your preferred tool or Supabase CLI.
