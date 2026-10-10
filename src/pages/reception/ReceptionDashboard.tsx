import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { UserPlus, ClipboardList, Search, Activity, Calendar, Smartphone } from 'lucide-react';
import { SmsReminderDialog } from '@/components/SmsReminderDialog';

const QuickAction = ({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) => (
  <button onClick={onClick} className="stoma-stat-card flex flex-col items-center gap-3 text-center cursor-pointer w-full">
    <div className="w-12 h-12 rounded-xl stoma-gradient flex items-center justify-center">
      <Icon className="w-6 h-6 text-primary-foreground" />
    </div>
    <span className="text-sm font-medium text-foreground">{label}</span>
  </button>
);

const ReceptionDashboard = () => {
  const navigate = useNavigate();
  const [todayCount, setTodayCount] = useState(0);
  const [smsOpen, setSmsOpen] = useState(false);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    supabase.from('visit_orders')
      .select('id', { count: 'exact', head: true })
      .gte('visit_datetime', today.toISOString())
      .then(({ count }) => setTodayCount(count || 0));
  }, []);

  return (
    <DashboardLayout title="Registratura paneli">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <p className="text-muted-foreground">Bugungi qabullar: <span className="font-semibold text-foreground">{todayCount} ta</span></p>
        <Button variant="outline" size="sm" onClick={() => setSmsOpen(true)} className="border-primary/40 text-primary hover:bg-primary/10">
          <Smartphone className="w-4 h-4 mr-1.5" /> Bugungi SMS eslatmalar
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        <QuickAction icon={Calendar} label="Qabullar taqvimi" onClick={() => navigate('/reception/calendar')} />
        <QuickAction icon={UserPlus} label="Bemor qo'shish" onClick={() => navigate('/reception/patients/new')} />
        <QuickAction icon={Search} label="Bemor qidirish" onClick={() => navigate('/reception/patients')} />
        <QuickAction icon={ClipboardList} label="Yangi buyurtma" onClick={() => navigate('/reception/orders/new')} />
        <QuickAction icon={Activity} label="Buyurtmalar ro'yxati" onClick={() => navigate('/reception/orders')} />
      </div>

      <SmsReminderDialog open={smsOpen} onOpenChange={setSmsOpen} />
    </DashboardLayout>
  );
};

export default ReceptionDashboard;
