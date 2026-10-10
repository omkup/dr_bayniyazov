import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format, addDays, startOfWeek, addWeeks, subWeeks, subDays, isSameDay } from 'date-fns';
import { uz } from 'date-fns/locale';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, Plus, User, Stethoscope, Phone, Smartphone } from 'lucide-react';
import { SmsReminderDialog } from '@/components/SmsReminderDialog';

const TIME_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00'
];

const statusColors: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300',
  SENT_TO_DOCTOR: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950 dark:text-sky-300',
  IN_PROGRESS: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300',
  DONE: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300',
  CANCELLED: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300',
};

const statusLabels: Record<string, string> = {
  NEW: 'Yangi',
  SENT_TO_DOCTOR: 'Shifokorda',
  IN_PROGRESS: 'Jarayonda',
  DONE: 'Bajarildi',
  CANCELLED: 'Bekor qilingan',
};

interface Doctor {
  id: string;
  full_name: string;
}

interface VisitOrder {
  id: string;
  patient_id: string;
  assigned_doctor_id: string;
  visit_datetime: string;
  status: string;
  complaint?: string;
  price?: number;
  patients?: {
    full_name: string;
    phone: string;
  };
}

const AppointmentsCalendar = () => {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('all');
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [orders, setOrders] = useState<VisitOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [smsDialogOpen, setSmsDialogOpen] = useState(false);

  // Shifokorlarni yuklash
  useEffect(() => {
    supabase.from('doctor_directory')
      .select('id, full_name')
      .then(({ data }) => {
        if (data) setDoctors(data);
      });
  }, []);

  // Buyurtmalarni yuklash
  useEffect(() => {
    fetchOrders();
  }, [currentDate, viewMode, selectedDoctorId]);

  const fetchOrders = async () => {
    setLoading(true);
    let start: Date;
    let end: Date;

    if (viewMode === 'day') {
      start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(currentDate);
      end.setHours(23, 59, 59, 999);
    } else {
      start = startOfWeek(currentDate, { weekStartsOn: 1 });
      start.setHours(0, 0, 0, 0);
      end = addDays(start, 6);
      end.setHours(23, 59, 59, 999);
    }

    let query = supabase.from('visit_orders')
      .select(`
        id, patient_id, assigned_doctor_id, visit_datetime, status, complaint, price,
        patients(full_name, phone)
      `)
      .gte('visit_datetime', start.toISOString())
      .lte('visit_datetime', end.toISOString())
      .neq('status', 'CANCELLED');

    if (selectedDoctorId !== 'all') {
      query = query.eq('assigned_doctor_id', selectedDoctorId);
    }

    const { data } = await query;
    setOrders((data as any) || []);
    setLoading(false);
  };

  const activeDoctors = selectedDoctorId === 'all'
    ? doctors
    : doctors.filter(d => d.id === selectedDoctorId);

  // Berilgan sana, vaqt va shifokor uchun qabulni topish
  const findOrder = (date: Date, timeSlot: string, doctorId: string) => {
    const [hours, minutes] = timeSlot.split(':').map(Number);
    return orders.find(order => {
      if (order.assigned_doctor_id !== doctorId) return false;
      const orderDate = new Date(order.visit_datetime);
      return (
        isSameDay(orderDate, date) &&
        orderDate.getHours() === hours &&
        Math.abs(orderDate.getMinutes() - minutes) < 15
      );
    });
  };

  const handleSlotClick = (date: Date, timeSlot: string, doctorId: string, existingOrder?: VisitOrder) => {
    if (existingOrder) {
      navigate(`/doctor/orders/${existingOrder.id}`);
      return;
    }
    const [hours, minutes] = timeSlot.split(':').map(Number);
    const targetDate = new Date(date);
    targetDate.setHours(hours, minutes, 0, 0);

    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const localDatetime = `${year}-${month}-${day}T${hh}:${mm}`;

    navigate(`/reception/orders/new?doctor=${doctorId}&datetime=${encodeURIComponent(localDatetime)}`);
  };

  const weekDays = Array.from({ length: 6 }).map((_, i) => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    return addDays(weekStart, i);
  });

  return (
    <DashboardLayout title="Qabullar taqvimi (Jadval)">
      <div className="space-y-4">
        {/* Yuqori boshqaruv paneli */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-4 rounded-xl border">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentDate(p => viewMode === 'day' ? subDays(p, 1) : subWeeks(p, 1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentDate(new Date())}
            >
              Bugun
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentDate(p => viewMode === 'day' ? addDays(p, 1) : addWeeks(p, 1))}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <span className="font-semibold text-base sm:text-lg ml-2 capitalize">
              {viewMode === 'day'
                ? format(currentDate, 'd MMMM, yyyy (EEEE)', { locale: uz })
                : `${format(weekDays[0], 'd MMMM', { locale: uz })} — ${format(weekDays[5], 'd MMMM, yyyy', { locale: uz })}`}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Barcha shifokorlar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barcha shifokorlar</SelectItem>
                {doctors.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex rounded-lg border bg-muted p-0.5">
              <Button
                variant={viewMode === 'day' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setViewMode('day')}
              >
                Kunlik
              </Button>
              <Button
                variant={viewMode === 'week' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setViewMode('week')}
              >
                Haftalik
              </Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setSmsDialogOpen(true)}
              className="border-primary/40 text-primary hover:bg-primary/10"
            >
              <Smartphone className="w-4 h-4 mr-1.5" /> SMS eslatmalar
            </Button>

            <Button size="sm" onClick={() => navigate('/reception/orders/new')}>
              <Plus className="w-4 h-4 mr-1" /> Yangi qabul
            </Button>
          </div>
        </div>

        <SmsReminderDialog
          open={smsDialogOpen}
          onOpenChange={setSmsDialogOpen}
          targetDate={currentDate}
        />

        {/* Status tushuntirishlari (Legend) */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap px-1">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-blue-500 inline-block"></span> Yangi qabul
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-sky-500 inline-block"></span> Shifokorga yuborilgan
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-500 inline-block"></span> Jarayonda
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-500 inline-block"></span> Bajarildi
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border border-dashed border-border inline-block bg-background"></span> Bo'sh vaqt (30 daqiqa)
          </span>
        </div>

        {/* KUNLIK JADVAL (Har bir shifokor alohida ustunda) */}
        {viewMode === 'day' && (
          <div className="bg-card rounded-xl border overflow-x-auto shadow-sm">
            <table className="w-full min-w-[700px] border-collapse text-left">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 w-20 text-xs font-semibold text-muted-foreground uppercase border-r text-center sticky left-0 bg-muted/90 z-10">
                    Vaqt
                  </th>
                  {activeDoctors.map(doc => (
                    <th key={doc.id} className="p-3 text-sm font-semibold text-foreground border-r last:border-r-0 min-w-[200px]">
                      <div className="flex items-center gap-2">
                        <Stethoscope className="w-4 h-4 text-primary" />
                        <span>{doc.full_name}</span>
                      </div>
                    </th>
                  ))}
                  {activeDoctors.length === 0 && (
                    <th className="p-4 text-center text-sm text-muted-foreground">Shifokorlar topilmadi</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {TIME_SLOTS.map(slot => (
                  <tr key={slot} className="border-b hover:bg-muted/10 transition-colors">
                    <td className="p-2 text-xs font-mono font-medium text-center border-r bg-muted/20 text-muted-foreground sticky left-0 z-10">
                      {slot}
                    </td>
                    {activeDoctors.map(doc => {
                      const order = findOrder(currentDate, slot, doc.id);
                      return (
                        <td key={doc.id} className="p-1.5 border-r last:border-r-0 align-top">
                          {order ? (
                            <div
                              onClick={() => handleSlotClick(currentDate, slot, doc.id, order)}
                              className={`p-2 rounded-lg border text-xs cursor-pointer transition-all shadow-xs hover:shadow-md ${statusColors[order.status] || 'bg-muted'}`}
                            >
                              <div className="flex items-center justify-between font-semibold">
                                <span className="truncate">{order.patients?.full_name}</span>
                                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-current">
                                  {statusLabels[order.status] || order.status}
                                </Badge>
                              </div>
                              {order.patients?.phone && (
                                <p className="text-[11px] opacity-80 mt-0.5 flex items-center gap-1">
                                  <Phone className="w-3 h-3" /> {order.patients.phone}
                                </p>
                              )}
                              {order.complaint && (
                                <p className="text-[11px] opacity-75 truncate mt-1">
                                  {order.complaint}
                                </p>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSlotClick(currentDate, slot, doc.id)}
                              className="w-full h-11 rounded border border-dashed border-border/70 hover:border-primary/80 hover:bg-primary/5 flex items-center justify-center gap-1 text-[11px] text-muted-foreground/60 hover:text-primary transition-all group"
                            >
                              <Plus className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                              <span className="group-hover:inline opacity-0 group-hover:opacity-100 transition-opacity">Yozish</span>
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* HAFTALIK JADVAL (Dushanbadan Shanbagacha) */}
        {viewMode === 'week' && (
          <div className="bg-card rounded-xl border overflow-x-auto shadow-sm">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 w-20 text-xs font-semibold text-muted-foreground uppercase border-r text-center sticky left-0 bg-muted/90 z-10">
                    Vaqt
                  </th>
                  {weekDays.map(day => {
                    const isToday = isSameDay(day, new Date());
                    return (
                      <th
                        key={day.toISOString()}
                        className={`p-3 text-sm font-semibold border-r last:border-r-0 min-w-[150px] ${isToday ? 'bg-primary/10 text-primary' : 'text-foreground'}`}
                      >
                        <div className="capitalize">{format(day, 'EEEE', { locale: uz })}</div>
                        <div className="text-xs font-normal opacity-80">{format(day, 'd MMMM')}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {TIME_SLOTS.map(slot => (
                  <tr key={slot} className="border-b hover:bg-muted/10 transition-colors">
                    <td className="p-2 text-xs font-mono font-medium text-center border-r bg-muted/20 text-muted-foreground sticky left-0 z-10">
                      {slot}
                    </td>
                    {weekDays.map(day => {
                      // Agar bitta shifokor tanlangan bo'lsa o'sha shifokor, aks holda birinchi shifokor yoki barcha orders
                      const relevantDoctorId = selectedDoctorId !== 'all' ? selectedDoctorId : (activeDoctors[0]?.id || '');
                      const order = findOrder(day, slot, relevantDoctorId);

                      return (
                        <td key={day.toISOString()} className="p-1.5 border-r last:border-r-0 align-top">
                          {order ? (
                            <div
                              onClick={() => handleSlotClick(day, slot, relevantDoctorId, order)}
                              className={`p-1.5 rounded border text-[11px] cursor-pointer transition-all shadow-xs hover:shadow-md ${statusColors[order.status] || 'bg-muted'}`}
                            >
                              <p className="font-semibold truncate">{order.patients?.full_name}</p>
                              <p className="text-[10px] opacity-80 truncate">{order.patients?.phone}</p>
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 mt-0.5 border-current">
                                {statusLabels[order.status] || order.status}
                              </Badge>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSlotClick(day, slot, relevantDoctorId)}
                              className="w-full h-10 rounded border border-dashed border-border/60 hover:border-primary/80 hover:bg-primary/5 flex items-center justify-center text-[10px] text-muted-foreground/50 hover:text-primary transition-all group"
                            >
                              <Plus className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AppointmentsCalendar;
