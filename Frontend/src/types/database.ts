export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          full_name: string | null;
          role: 'admin' | 'user' | 'security';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          full_name?: string | null;
          role?: 'admin' | 'user' | 'security';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          full_name?: string | null;
          role?: 'admin' | 'user' | 'security';
          created_at?: string;
          updated_at?: string;
        };
      };
      employees: {
        Row: {
          id: string;
          employee_id: string;
          full_name: string;
          department: string | null;
          position: string | null;
          email: string | null;
          phone: string | null;
          photo_url: string | null;
          status: 'active' | 'inactive' | 'on_leave';
          created_at: string;
        };
        Insert: {
          id?: string;
          employee_id: string;
          full_name: string;
          department?: string | null;
          position?: string | null;
          email?: string | null;
          phone?: string | null;
          photo_url?: string | null;
          status?: 'active' | 'inactive' | 'on_leave';
          created_at?: string;
        };
        Update: {
          id?: string;
          employee_id?: string;
          full_name?: string;
          department?: string | null;
          position?: string | null;
          email?: string | null;
          phone?: string | null;
          photo_url?: string | null;
          status?: 'active' | 'inactive' | 'on_leave';
          created_at?: string;
        };
      };
      attendance_records: {
        Row: {
          id: string;
          employee_id: string;
          date: string;
          check_in_time: string | null;
          check_out_time: string | null;
          status: 'present' | 'absent' | 'late' | 'on_leave';
          marked_by: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          employee_id: string;
          date: string;
          check_in_time?: string | null;
          check_out_time?: string | null;
          status?: 'present' | 'absent' | 'late' | 'on_leave';
          marked_by?: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          employee_id?: string;
          date?: string;
          check_in_time?: string | null;
          check_out_time?: string | null;
          status?: 'present' | 'absent' | 'late' | 'on_leave';
          marked_by?: string;
          notes?: string | null;
          created_at?: string;
        };
      };
      system_logs: {
        Row: {
          id: string;
          event_type: 'auth' | 'attendance' | 'security' | 'system';
          description: string;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_type: 'auth' | 'attendance' | 'security' | 'system';
          description: string;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_type?: 'auth' | 'attendance' | 'security' | 'system';
          description?: string;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
      };
    };
  };
}

export type Employee = Database['public']['Tables']['employees']['Row'];
export type AttendanceRecord = Database['public']['Tables']['attendance_records']['Row'];
export type SystemLog = Database['public']['Tables']['system_logs']['Row'];
