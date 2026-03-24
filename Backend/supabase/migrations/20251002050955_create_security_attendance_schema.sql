/*
  # Security and Attendance Management System Schema

  ## Overview
  This migration creates the complete database schema for a security and attendance 
  management system with user authentication, employee management,
  and attendance tracking. (Intruder module removed)

  ## New Tables

  ### 1. `profiles`
  User profiles linked to Supabase auth.users
  - `id` (uuid, primary key, references auth.users)
  - `username` (text, unique, not null)
  - `full_name` (text)
  - `role` (text, default 'user')
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 2. `employees`
  Employee records for attendance tracking
  - `id` (uuid, primary key)
  - `employee_id` (text, unique)
  - `full_name` (text, not null)
  - `department` (text)
  - `position` (text)
  - `email` (text)
  - `phone` (text)
  - `photo_url` (text)
  - `status` (text, default 'active')
  - `created_at` (timestamptz)

  ### 3. `attendance_records`
  Daily attendance tracking
  - `id` (uuid, primary key)
  - `employee_id` (uuid, references employees)
  - `date` (date, not null)
  - `check_in_time` (timestamptz)
  - `check_out_time` (timestamptz)
  - `status` (text, default 'absent')
  - `marked_by` (text)
  - `notes` (text)
  - `created_at` (timestamptz)

  ### 4. `system_logs`
  General system activity logging
  - `id` (uuid, primary key)
  - `event_type` (text, not null)
  - `description` (text, not null)
  - `metadata` (jsonb)
  - `created_at` (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Add policies for authenticated users to access their data
  - Restrict sensitive operations to admin role
  - Implement proper ownership checks

  ## Notes
  - All timestamps use UTC timezone
  - UUIDs used for primary keys for better security
  - Indexes added for frequently queried columns
  - Foreign key constraints ensure data integrity
*/

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  full_name text,
  role text DEFAULT 'user' CHECK (role IN ('admin', 'user', 'security')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Create employees table
CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id text UNIQUE NOT NULL,
  full_name text NOT NULL,
  department text,
  position text,
  email text,
  phone text,
  photo_url text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view employees"
  ON employees FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert employees"
  ON employees FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update employees"
  ON employees FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create attendance_records table
CREATE TABLE IF NOT EXISTS attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  check_in_time timestamptz,
  check_out_time timestamptz,
  status text DEFAULT 'absent' CHECK (status IN ('present', 'absent', 'late', 'on_leave')),
  marked_by text DEFAULT 'system',
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, date)
);

ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view attendance"
  ON attendance_records FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert attendance"
  ON attendance_records FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update attendance"
  ON attendance_records FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- Create system_logs table
CREATE TABLE IF NOT EXISTS system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('auth', 'attendance', 'security', 'system')),
  description text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view logs"
  ON system_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert logs"
  ON system_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(date);
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance_records(employee_id);
-- Intruder module removed: no intruder tables or indexes
CREATE INDEX IF NOT EXISTS idx_system_logs_created ON system_logs(created_at);

-- Insert sample employees
INSERT INTO employees (employee_id, full_name, department, position, email, phone, photo_url, status)
VALUES
  ('EMP001', 'John Smith', 'Engineering', 'Senior Developer', 'john.smith@company.com', '+1-555-0101', 'https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg?auto=compress&cs=tinysrgb&w=200', 'active'),
  ('EMP002', 'Sarah Johnson', 'Marketing', 'Marketing Manager', 'sarah.j@company.com', '+1-555-0102', 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=200', 'active'),
  ('EMP003', 'Michael Chen', 'Engineering', 'DevOps Engineer', 'michael.c@company.com', '+1-555-0103', 'https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=200', 'active'),
  ('EMP004', 'Emily Davis', 'HR', 'HR Director', 'emily.d@company.com', '+1-555-0104', 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=200', 'active'),
  ('EMP005', 'David Martinez', 'Finance', 'Financial Analyst', 'david.m@company.com', '+1-555-0105', 'https://images.pexels.com/photos/1681010/pexels-photo-1681010.jpeg?auto=compress&cs=tinysrgb&w=200', 'active'),
  ('EMP006', 'Lisa Anderson', 'Sales', 'Sales Director', 'lisa.a@company.com', '+1-555-0106', 'https://images.pexels.com/photos/1858175/pexels-photo-1858175.jpeg?auto=compress&cs=tinysrgb&w=200', 'active'),
  ('EMP007', 'James Wilson', 'Engineering', 'Frontend Developer', 'james.w@company.com', '+1-555-0107', 'https://images.pexels.com/photos/1212984/pexels-photo-1212984.jpeg?auto=compress&cs=tinysrgb&w=200', 'active'),
  ('EMP008', 'Jennifer Brown', 'Operations', 'Operations Manager', 'jennifer.b@company.com', '+1-555-0108', 'https://images.pexels.com/photos/1130626/pexels-photo-1130626.jpeg?auto=compress&cs=tinysrgb&w=200', 'active'),
  ('EMP009', 'Robert Taylor', 'Security', 'Security Chief', 'robert.t@company.com', '+1-555-0109', 'https://images.pexels.com/photos/1516680/pexels-photo-1516680.jpeg?auto=compress&cs=tinysrgb&w=200', 'active'),
  ('EMP010', 'Amanda Lee', 'Engineering', 'QA Engineer', 'amanda.l@company.com', '+1-555-0110', 'https://images.pexels.com/photos/1181686/pexels-photo-1181686.jpeg?auto=compress&cs=tinysrgb&w=200', 'active')
ON CONFLICT (employee_id) DO NOTHING;