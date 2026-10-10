import { useAuth } from '@/lib/auth-context';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from '@/components/ui/sidebar';
import {
  Stethoscope, Users, UserPlus, Search, ClipboardList,
  Activity, Settings, BarChart3, Package, LogOut, Home, Banknote, Calendar
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const menuByRole = {
  admin: [
    { label: 'Bosh sahifa', icon: Home, path: '/admin' },
    { label: 'Foydalanuvchilar', icon: Users, path: '/admin/users' },
    { label: 'Xizmatlar va narxlar', icon: Package, path: '/admin/services' },
    { label: 'Barcha buyurtmalar', icon: ClipboardList, path: '/admin/orders' },
    { label: 'Bemorlar', icon: UserPlus, path: '/admin/patients' },
    { label: 'Hisobotlar', icon: BarChart3, path: '/admin/reports' },
    { label: 'Qarzlar', icon: Banknote, path: '/admin/debts' },
  ],
  reception: [
    { label: 'Bosh sahifa', icon: Home, path: '/reception' },
    { label: 'Qabullar taqvimi', icon: Calendar, path: '/reception/calendar' },
    { label: 'Bemor qo\'shish', icon: UserPlus, path: '/reception/patients/new' },
    { label: 'Bemor qidirish', icon: Search, path: '/reception/patients' },
    { label: 'Yangi buyurtma', icon: ClipboardList, path: '/reception/orders/new' },
    { label: 'Buyurtmalar', icon: Activity, path: '/reception/orders' },
  ],
  doctor: [
    { label: 'Bosh sahifa', icon: Home, path: '/doctor' },
    { label: 'Mening qabullarim', icon: ClipboardList, path: '/doctor/orders' },
  ],
};

const AppSidebar = () => {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const items = role ? menuByRole[role] : [];

  const roleLabel: Record<string, string> = {
    admin: 'Administrator',
    reception: 'Registratura',
    doctor: 'Shifokor',
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white p-1 flex items-center justify-center shadow-sm border border-sidebar-border overflow-hidden shrink-0">
            <img src="/logo-icon.png" alt="DR.BAYNIYAZOV" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm text-sidebar-primary-foreground tracking-wide truncate">DR.BAYNIYAZOV</p>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-sidebar-foreground/70 truncate">Stomatologiya</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-[11px] uppercase tracking-wider">
            {role ? roleLabel[role] : 'Menu'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    onClick={() => navigate(item.path)}
                    isActive={location.pathname === item.path}
                    tooltip={item.label}
                  >
                    <item.icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2 mb-2 px-1">
          <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-semibold text-sidebar-accent-foreground">
            {profile?.full_name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-sidebar-foreground truncate">{profile?.full_name}</p>
            <p className="text-[10px] text-sidebar-foreground/50 truncate">{profile?.email}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground"
          onClick={signOut}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Chiqish
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
};

export default AppSidebar;
