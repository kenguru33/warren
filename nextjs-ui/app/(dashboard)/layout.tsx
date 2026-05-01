import { SidebarShell } from '@/app/components/warren/sidebar-shell'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <SidebarShell>{children}</SidebarShell>
}
