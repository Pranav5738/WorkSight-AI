import {
  Activity,
  CheckCircle2,
  ClipboardList,
  LayoutDashboard,
  ListTree,
  ScanFace,
  Server,
  Settings,
  UserPlus,
  Users
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavigationItem {
  label: string;
  to: string;
  icon: LucideIcon;
  description?: string;
}

export interface NavigationSection {
  label: string;
  items: NavigationItem[];
}

export const navigationSections: NavigationSection[] = [
  {
    label: 'Overview',
    items: [
      {
        label: 'Dashboard',
        to: '/dashboard',
        icon: LayoutDashboard,
        description: 'KPIs and activity feed'
      }
    ]
  },
  {
    label: 'Operations',
    items: [
      {
        label: 'Attendance',
        to: '/attendance',
        icon: CheckCircle2,
        description: 'AI attendance pipeline'
      },
      {
        label: 'Monitoring',
        to: '/monitoring',
        icon: Activity,
        description: 'Real-time monitoring controls'
      },
      {
        label: 'Recognized',
        to: '/recognized',
        icon: ScanFace,
        description: 'Recognition outcomes'
      }
    ]
  },
  {
    label: 'Management',
    items: [
      {
        label: 'Users',
        to: '/users',
        icon: Users,
        description: 'User directory and roles'
      },
      {
        label: 'Enroll',
        to: '/enroll',
        icon: UserPlus,
        description: 'Employee onboarding'
      },
      {
        label: 'Manager',
        to: '/manager',
        icon: ClipboardList,
        description: 'Policy and productivity insights'
      }
    ]
  },
  {
    label: 'System',
    items: [
      {
        label: 'Logs',
        to: '/logs',
        icon: ListTree,
        description: 'Audit and event history'
      },
      {
        label: 'Settings',
        to: '/settings',
        icon: Settings,
        description: 'Application preferences'
      },
      {
        label: 'System',
        to: '/system',
        icon: Server,
        description: 'Runtime and diagnostics'
      }
    ]
  }
];

export const flatNavigationItems = navigationSections.flatMap((section) => section.items);

export function resolveNavItem(pathname: string): NavigationItem | undefined {
  const exact = flatNavigationItems.find((item) => item.to === pathname);
  if (exact) return exact;
  return flatNavigationItems.find((item) => pathname.startsWith(item.to + '/'));
}
