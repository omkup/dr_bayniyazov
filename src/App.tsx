import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import AuthDebugBanner from "@/components/AuthDebugBanner";

import Index from "./pages/Index";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

// Admin
import AdminDashboard from "./pages/admin/AdminDashboard";
import UsersManagement from "./pages/admin/UsersManagement";
import ServicesManagement from "./pages/admin/ServicesManagement";
import AdminOrders from "./pages/admin/AdminOrders";
import AdminPatients from "./pages/admin/AdminPatients";
import AdminReports from "./pages/admin/AdminReports";
import AdminDebts from "./pages/admin/AdminDebts";
import AdminRecovery from "./pages/admin/AdminRecovery";
import PatientMedicalHistory from "./pages/admin/PatientMedicalHistory";

// Reception
import ReceptionDashboard from "./pages/reception/ReceptionDashboard";
import PatientForm from "./pages/reception/PatientForm";
import PatientsList from "./pages/reception/PatientsList";
import OrderForm from "./pages/reception/OrderForm";
import OrdersList from "./pages/reception/OrdersList";
import AppointmentsCalendar from "./pages/reception/AppointmentsCalendar";

// Doctor
import DoctorDashboard from "./pages/doctor/DoctorDashboard";
import DoctorOrderDetail from "./pages/doctor/DoctorOrderDetail";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: string[] }) => {
  const { role, authLoading, profileLoading, user } = useAuth();
  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Sessiya tekshirilmoqda...</div></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (profileLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Profil yuklanmoqda...</div></div>;
  if (!role || !allowedRoles.includes(role)) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AuthDebugBanner />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Navigate to="/login" replace />} />

            {/* Admin */}
            <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute allowedRoles={['admin']}><UsersManagement /></ProtectedRoute>} />
            <Route path="/admin/services" element={<ProtectedRoute allowedRoles={['admin']}><ServicesManagement /></ProtectedRoute>} />
            <Route path="/admin/orders" element={<ProtectedRoute allowedRoles={['admin']}><AdminOrders /></ProtectedRoute>} />
            <Route path="/admin/patients" element={<ProtectedRoute allowedRoles={['admin']}><AdminPatients /></ProtectedRoute>} />
            <Route path="/admin/patients/:id/history" element={<ProtectedRoute allowedRoles={['admin']}><PatientMedicalHistory /></ProtectedRoute>} />
            <Route path="/admin/reports" element={<ProtectedRoute allowedRoles={['admin']}><AdminReports /></ProtectedRoute>} />
            <Route path="/admin/debts" element={<ProtectedRoute allowedRoles={['admin']}><AdminDebts /></ProtectedRoute>} />
            <Route path="/admin/recovery" element={<AdminRecovery />} />

            {/* Reception */}
            <Route path="/reception" element={<ProtectedRoute allowedRoles={['reception']}><ReceptionDashboard /></ProtectedRoute>} />
            <Route path="/reception/calendar" element={<ProtectedRoute allowedRoles={['reception']}><AppointmentsCalendar /></ProtectedRoute>} />
            <Route path="/reception/patients/new" element={<ProtectedRoute allowedRoles={['reception']}><PatientForm /></ProtectedRoute>} />
            <Route path="/reception/patients" element={<ProtectedRoute allowedRoles={['reception']}><PatientsList /></ProtectedRoute>} />
            <Route path="/reception/orders/new" element={<ProtectedRoute allowedRoles={['reception']}><OrderForm /></ProtectedRoute>} />
            <Route path="/reception/orders" element={<ProtectedRoute allowedRoles={['reception']}><OrdersList /></ProtectedRoute>} />

            {/* Doctor */}
            <Route path="/doctor" element={<ProtectedRoute allowedRoles={['doctor']}><DoctorDashboard /></ProtectedRoute>} />
            <Route path="/doctor/orders" element={<ProtectedRoute allowedRoles={['doctor']}><DoctorDashboard /></ProtectedRoute>} />
            <Route path="/doctor/orders/:id" element={<ProtectedRoute allowedRoles={['doctor']}><DoctorOrderDetail /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
