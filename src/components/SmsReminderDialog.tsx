import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  sendSms, generateAppointmentSmsText, generateBirthdaySmsText,
  formatPhoneNumber, getDefaultFromPhone, setDefaultFromPhone
} from '@/lib/httpsms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, addDays } from 'date-fns';
import { uz } from 'date-fns/locale';
import {
  Send, CheckCircle2, AlertCircle, Smartphone, RefreshCw,
  Gift, Calendar, Clock, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

interface AppointmentCandidate {
  orderId: string;
  patientId: string;
  patientName: string;
  phone: string;
  timeStr: string;
  visitDateTimeFormatted: string;
  doctorName: string;
  smsText: string;
  alreadySent: boolean;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  error?: string;
}

interface BirthdayCandidate {
  patientId: string;
  patientName: string;
  phone: string;
  birthDate: string;
  age: number;
  smsText: string;
  alreadySent: boolean;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  error?: string;
}

interface SmsReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SmsReminderDialog = ({
  open,
  onOpenChange,
}: SmsReminderDialogProps) => {
  const [activeTab, setActiveTab] = useState<'appointments' | 'birthdays'>('appointments');
  const [candidates, setCandidates] = useState<AppointmentCandidate[]>([]);
  const [birthdayCandidates, setBirthdayCandidates] = useState<BirthdayCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSendingAll, setIsSendingAll] = useState(false);
  const [fromPhone, setFromPhone] = useState(getDefaultFromPhone());

  // Ertangi kun (Tashrifga 1 kun qolgan sana)
  const tomorrow = addDays(new Date(), 1);

  useEffect(() => {
    if (open) {
      setFromPhone(getDefaultFromPhone());
      fetchTomorrowAppointments();
      fetchTomorrowBirthdays();
    }
  }, [open]);

  const handleFromPhoneChange = (val: string) => {
    setFromPhone(val);
    setDefaultFromPhone(val);
  };

  /**
   * 1. FAQAT TASHRIFGA 1 KUN QOLGAN BEMORLARNI YUKLASH (Ertangi kun)
   * Shunda serverdan butun baza emas, faqat 1 kunlik qabullar tezkor yuklanadi!
   */
  const fetchTomorrowAppointments = async () => {
    setLoading(true);
    try {
      const startOfTomorrow = new Date(tomorrow);
      startOfTomorrow.setHours(0, 0, 0, 0);

      const endOfTomorrow = new Date(tomorrow);
      endOfTomorrow.setHours(23, 59, 59, 999);

      // Faqat ertangi kungi qabullarni olish
      const { data: orders, error: oErr } = await supabase
        .from('visit_orders')
        .select(`
          id, patient_id, visit_datetime, status, assigned_doctor_id,
          patients(id, full_name, phone)
        `)
        .gte('visit_datetime', startOfTomorrow.toISOString())
        .lte('visit_datetime', endOfTomorrow.toISOString())
        .neq('status', 'CANCELLED')
        .order('visit_datetime', { ascending: true });

      if (oErr) throw oErr;

      // Shifokorlar ismini olish
      const docIds = [...new Set((orders || []).map(o => o.assigned_doctor_id))];
      const { data: doctors } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', docIds);

      const docMap = Object.fromEntries((doctors || []).map(d => [d.id, d.full_name]));

      // Shu qabullarga allaqachon eslatma yuborilganmi tekshirish
      const orderIds = (orders || []).map(o => o.id);
      const { data: sentReminders } = await supabase
        .from('reminders')
        .select('visit_order_id, status')
        .in('visit_order_id', orderIds)
        .eq('status', 'sent');

      const sentOrderIds = new Set((sentReminders || []).map(r => r.visit_order_id));

      const list: AppointmentCandidate[] = (orders || []).map(o => {
        const p = (o as any).patients;
        const vDate = new Date(o.visit_datetime);
        const timeStr = format(vDate, 'HH:mm');
        const formattedVisitDate = `${format(vDate, 'd-MMMM', { locale: uz })} soat ${timeStr}`;
        const docName = docMap[o.assigned_doctor_id] || 'Ataniyaz Bayniyazov';
        const patientName = p?.full_name || 'Bemor';
        const alreadySent = sentOrderIds.has(o.id);

        // Rasmiy talab qilingan SMS shablon
        const smsText = generateAppointmentSmsText({
          patientName,
          nextVisitDate: formattedVisitDate,
          doctorName: docName,
        });

        return {
          orderId: o.id,
          patientId: p?.id || '',
          patientName,
          phone: p?.phone || '',
          timeStr,
          visitDateTimeFormatted: formattedVisitDate,
          doctorName: docName,
          smsText,
          alreadySent,
          status: alreadySent ? 'sent' : 'pending',
        };
      });

      setCandidates(list);
    } catch (err: any) {
      console.error("Ertangi qabullarni yuklashda xatolik:", err);
      toast.error("Qabullarni yuklab bo'lmadi", { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  /**
   * 2. TUG'ILGAN KUNIGA 1 KUN QOLGAN BEMORLARNI YUKLASH (Ertaga tug'ilgan kuni bo'lganlar)
   */
  const fetchTomorrowBirthdays = async () => {
    try {
      const tomorrowMonth = (tomorrow.getMonth() + 1).toString().padStart(2, '0');
      const tomorrowDay = tomorrow.getDate().toString().padStart(2, '0');
      const monthDayPattern = `-${tomorrowMonth}-${tomorrowDay}`; // Masalan: -10-11

      const { data: patientsList, error } = await supabase
        .from('patients')
        .select('id, full_name, phone, birth_date')
        .eq('is_deleted', false)
        .not('birth_date', 'is', null);

      if (error) throw error;

      // Ertaga tug'ilgan kuni bo'lganlarni filtrlash
      const matching = (patientsList || []).filter(p => {
        if (!p.birth_date) return false;
        return p.birth_date.endsWith(monthDayPattern);
      });

      // Oxirgi 30 kunda tabrik SMS olganmi tekshirish
      const patientIds = matching.map(p => p.id);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentBirthdayReminders } = await supabase
        .from('reminders')
        .select('patient_id')
        .in('patient_id', patientIds)
        .like('message', '%tavallud%')
        .gte('created_at', thirtyDaysAgo);

      const alreadySentIds = new Set((recentBirthdayReminders || []).map(r => r.patient_id));

      const birthdayList: BirthdayCandidate[] = matching.map(p => {
        const bYear = parseInt(p.birth_date.split('-')[0], 10);
        const age = tomorrow.getFullYear() - bYear;
        const alreadySent = alreadySentIds.has(p.id);

        const smsText = generateBirthdaySmsText({
          patientName: p.full_name,
        });

        return {
          patientId: p.id,
          patientName: p.full_name,
          phone: p.phone,
          birthDate: p.birth_date,
          age,
          smsText,
          alreadySent,
          status: alreadySent ? 'sent' : 'pending',
        };
      });

      setBirthdayCandidates(birthdayList);
    } catch (err: any) {
      console.error("Tug'ilgan kunlarni yuklashda xatolik:", err);
    }
  };

  // QABUL SMS yuborish (Bitta)
  const handleSendSingleAppointment = async (candidate: AppointmentCandidate, index: number) => {
    if (!fromPhone || fromPhone.trim().length < 9) {
      toast.error("Yuboruvchi raqam kiritilmagan", {
        description: "httpsms ilovangizdagi telefon raqamingizni kiriting (masalan: +998901234567)"
      });
      return;
    }

    setCandidates(prev => {
      const copy = [...prev];
      copy[index].status = 'sending';
      return copy;
    });

    const res = await sendSms({
      to: candidate.phone,
      content: candidate.smsText,
      from: fromPhone,
    });

    if (res.success) {
      await supabase.from('reminders').insert({
        visit_order_id: candidate.orderId,
        patient_id: candidate.patientId,
        channel: 'sms',
        message: candidate.smsText,
        remind_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
        status: 'sent',
      });

      setCandidates(prev => {
        const copy = [...prev];
        copy[index].status = 'sent';
        copy[index].alreadySent = true;
        return copy;
      });
      toast.success(`${candidate.patientName} ga SMS yuborildi`);
    } else {
      setCandidates(prev => {
        const copy = [...prev];
        copy[index].status = 'failed';
        copy[index].error = res.error;
        return copy;
      });
      toast.error(`${candidate.patientName} ga SMS ketmadi`, { description: res.error });
    }
  };

  // BARCHA QABULLARGA SMS yuborish
  const handleSendAllAppointments = async () => {
    if (!fromPhone || fromPhone.trim().length < 9) {
      toast.error("Yuboruvchi raqam kiritilmagan", {
        description: "Yuqoridagi maydonga httpsms ilovangizdagi telefon raqamingizni kiriting"
      });
      return;
    }

    const pending = candidates
      .map((c, index) => ({ candidate: c, index }))
      .filter(({ candidate }) => !candidate.alreadySent);

    if (pending.length === 0) {
      toast.info("Yuborilmagan SMS lar mavjud emas");
      return;
    }

    setIsSendingAll(true);
    let successCount = 0;
    let failCount = 0;

    for (const item of pending) {
      const { candidate, index } = item;
      setCandidates(prev => {
        const copy = [...prev];
        copy[index].status = 'sending';
        return copy;
      });

      const res = await sendSms({
        to: candidate.phone,
        content: candidate.smsText,
        from: fromPhone,
      });

      if (res.success) {
        await supabase.from('reminders').insert({
          visit_order_id: candidate.orderId,
          patient_id: candidate.patientId,
          channel: 'sms',
          message: candidate.smsText,
          remind_at: new Date().toISOString(),
          sent_at: new Date().toISOString(),
          status: 'sent',
        });

        setCandidates(prev => {
          const copy = [...prev];
          copy[index].status = 'sent';
          copy[index].alreadySent = true;
          return copy;
        });
        successCount++;
      } else {
        setCandidates(prev => {
          const copy = [...prev];
          copy[index].status = 'failed';
          copy[index].error = res.error;
          return copy;
        });
        failCount++;
      }

      await new Promise(r => setTimeout(r, 600));
    }

    setIsSendingAll(false);
    toast.success(`Eslatmalar yuborildi: ${successCount} ta muvaffaqiyatli, ${failCount} ta xato`);
  };

  // TUG'ILGAN KUN SMS yuborish (Bitta)
  const handleSendSingleBirthday = async (candidate: BirthdayCandidate, index: number) => {
    if (!fromPhone || fromPhone.trim().length < 9) {
      toast.error("Yuboruvchi raqam kiritilmagan", {
        description: "httpsms telefon raqamingizni kiriting"
      });
      return;
    }

    setBirthdayCandidates(prev => {
      const copy = [...prev];
      copy[index].status = 'sending';
      return copy;
    });

    const res = await sendSms({
      to: candidate.phone,
      content: candidate.smsText,
      from: fromPhone,
    });

    if (res.success) {
      await supabase.from('reminders').insert({
        patient_id: candidate.patientId,
        channel: 'sms',
        message: candidate.smsText,
        remind_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
        status: 'sent',
      });

      setBirthdayCandidates(prev => {
        const copy = [...prev];
        copy[index].status = 'sent';
        copy[index].alreadySent = true;
        return copy;
      });
      toast.success(`${candidate.patientName} ga tabrik SMS yuborildi`);
    } else {
      setBirthdayCandidates(prev => {
        const copy = [...prev];
        copy[index].status = 'failed';
        copy[index].error = res.error;
        return copy;
      });
      toast.error(`${candidate.patientName} ga tabrik ketmadi`, { description: res.error });
    }
  };

  // BARCHA TUG'ILGAN KUNLARGA SMS yuborish
  const handleSendAllBirthdays = async () => {
    if (!fromPhone || fromPhone.trim().length < 9) {
      toast.error("Yuboruvchi raqam kiritilmagan");
      return;
    }

    const pending = birthdayCandidates
      .map((c, index) => ({ candidate: c, index }))
      .filter(({ candidate }) => !candidate.alreadySent);

    if (pending.length === 0) {
      toast.info("Yuborilmagan tabriklar yo'q");
      return;
    }

    setIsSendingAll(true);
    let successCount = 0;
    let failCount = 0;

    for (const item of pending) {
      const { candidate, index } = item;
      setBirthdayCandidates(prev => {
        const copy = [...prev];
        copy[index].status = 'sending';
        return copy;
      });

      const res = await sendSms({
        to: candidate.phone,
        content: candidate.smsText,
        from: fromPhone,
      });

      if (res.success) {
        await supabase.from('reminders').insert({
          patient_id: candidate.patientId,
          channel: 'sms',
          message: candidate.smsText,
          remind_at: new Date().toISOString(),
          sent_at: new Date().toISOString(),
          status: 'sent',
        });

        setBirthdayCandidates(prev => {
          const copy = [...prev];
          copy[index].status = 'sent';
          copy[index].alreadySent = true;
          return copy;
        });
        successCount++;
      } else {
        setBirthdayCandidates(prev => {
          const copy = [...prev];
          copy[index].status = 'failed';
          copy[index].error = res.error;
          return copy;
        });
        failCount++;
      }

      await new Promise(r => setTimeout(r, 600));
    }

    setIsSendingAll(false);
    toast.success(`Tabriklar yuborildi: ${successCount} ta muvaffaqiyatli, ${failCount} ta xato`);
  };

  const pendingAppointmentsCount = candidates.filter(c => !c.alreadySent).length;
  const pendingBirthdaysCount = birthdayCandidates.filter(c => !c.alreadySent).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-6">
        <DialogHeader className="pb-3 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">
                  Dr.Bayniyazov klinikasi — SMS xabarnomalar
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Ertaga ({format(tomorrow, 'd-MMMM, yyyy (EEEE)', { locale: uz })}) rejalashtirilgan qabullar va tug'ilgan kunlar
                </DialogDescription>
              </div>
            </div>

            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                fetchTomorrowAppointments();
                fetchTomorrowBirthdays();
              }}
              disabled={loading}
              title="Yangilash"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </DialogHeader>

        {/* Yuboruvchi telefon raqami (From) */}
        <div className="p-3 bg-muted/40 rounded-xl border mt-1">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <Label htmlFor="fromPhoneInput" className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
              <Smartphone className="w-4 h-4 text-primary" />
              Yuboruvchi telefon raqami (httpsms dagi SIM-karta):
            </Label>
            <span className="text-[11px] text-muted-foreground">
              (bir marta kiritilsa avtomatik saqlanadi)
            </span>
          </div>
          <Input
            id="fromPhoneInput"
            placeholder="+998901234567"
            value={fromPhone}
            onChange={(e) => handleFromPhoneChange(e.target.value)}
            className="h-8 text-xs font-mono max-w-sm mt-1.5"
          />
        </div>

        {/* TABS: Qabullar vs Tug'ilgan kunlar */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col overflow-hidden mt-2">
          <TabsList className="grid grid-cols-2 w-full max-w-md">
            <TabsTrigger value="appointments" className="text-xs flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Ertangi qabullar ({candidates.length})
              {pendingAppointmentsCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px] bg-primary text-primary-foreground">
                  {pendingAppointmentsCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="birthdays" className="text-xs flex items-center gap-1.5">
              <Gift className="w-3.5 h-3.5 text-pink-500" />
              Tug'ilgan kunlar ({birthdayCandidates.length})
              {pendingBirthdaysCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px] bg-pink-500 text-white">
                  {pendingBirthdaysCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: ERTANGI QABULLAR ESLATMASI */}
          <TabsContent value="appointments" className="flex-1 flex flex-col overflow-hidden space-y-3 mt-3">
            <div className="flex items-center justify-between bg-muted/20 p-2.5 rounded-lg border text-xs flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span>Ertangi qabullar: <strong>{candidates.length} ta</strong></span>
                <span>Yuborilmagan: <strong className="text-primary">{pendingAppointmentsCount} ta</strong></span>
                <span>Yuborilgan: <strong className="text-emerald-600">{candidates.length - pendingAppointmentsCount} ta</strong></span>
              </div>
              <Button
                size="sm"
                onClick={handleSendAllAppointments}
                disabled={isSendingAll || pendingAppointmentsCount === 0 || loading || !fromPhone}
                className="h-8 text-xs font-semibold"
              >
                <Send className="w-3.5 h-3.5 mr-1.5" />
                {isSendingAll ? "Yuborilmoqda..." : `Barchasiga SMS yuborish (${pendingAppointmentsCount})`}
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto border rounded-lg">
              {loading ? (
                <div className="py-12 text-center text-muted-foreground text-xs">
                  Ertangi qabullar yuklanmoqda...
                </div>
              ) : candidates.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-xs space-y-1">
                  <p className="font-medium text-foreground">Ertangi kunga rejalashtirilgan qabullar topilmadi.</p>
                  <p className="text-[11px]">Faqat tashrifiga 1 kun qolgan bemorlar ro'yxatda chiqadi.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow className="text-xs">
                      <TableHead className="w-20">Vaqt</TableHead>
                      <TableHead>Bemor</TableHead>
                      <TableHead>Telefon</TableHead>
                      <TableHead>Shifokor</TableHead>
                      <TableHead>SMS shabloni</TableHead>
                      <TableHead>Holat</TableHead>
                      <TableHead className="text-right">Amal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs">
                    {candidates.map((c, idx) => (
                      <TableRow key={c.orderId}>
                        <TableCell className="font-mono font-semibold text-primary">
                          {c.timeStr}
                        </TableCell>
                        <TableCell className="font-semibold">
                          {c.patientName}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">
                          {c.phone}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {c.doctorName}
                        </TableCell>
                        <TableCell className="max-w-[280px]">
                          <p className="text-[11px] text-muted-foreground bg-muted/40 p-1.5 rounded truncate" title={c.smsText}>
                            {c.smsText}
                          </p>
                        </TableCell>
                        <TableCell>
                          {c.status === 'sent' && (
                            <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 text-[10px]">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Yuborilgan
                            </Badge>
                          )}
                          {c.status === 'sending' && (
                            <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 text-[10px] animate-pulse">
                              Yuborilmoqda...
                            </Badge>
                          )}
                          {c.status === 'failed' && (
                            <Badge variant="outline" className="text-rose-600 border-rose-300 bg-rose-50 text-[10px]" title={c.error}>
                              <AlertCircle className="w-3 h-3 mr-1" /> Xato
                            </Badge>
                          )}
                          {c.status === 'pending' && (
                            <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-[10px]">
                              Yuborilmagan
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleSendSingleAppointment(c, idx)}
                            disabled={c.status === 'sending' || c.status === 'sent' || isSendingAll}
                          >
                            <Send className="w-3 h-3 mr-1" /> Yuborish
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          {/* TAB 2: TUG'ILGAN KUN TABRIKLARI VA 10% CHEGIRMA */}
          <TabsContent value="birthdays" className="flex-1 flex flex-col overflow-hidden space-y-3 mt-3">
            <div className="flex items-center justify-between bg-pink-50 dark:bg-pink-950/20 p-2.5 rounded-lg border border-pink-200 dark:border-pink-900 text-xs flex-wrap gap-2">
              <div className="flex items-center gap-2 text-pink-900 dark:text-pink-300">
                <Gift className="w-4 h-4 text-pink-500" />
                <span>Ertaga tug'ilgan kuni bo'ladigan bemorlar: <strong>{birthdayCandidates.length} ta</strong></span>
                <span className="text-muted-foreground ml-2">(10% chegirmali tabrik)</span>
              </div>
              <Button
                size="sm"
                onClick={handleSendAllBirthdays}
                disabled={isSendingAll || pendingBirthdaysCount === 0 || !fromPhone}
                className="h-8 text-xs font-semibold bg-pink-600 hover:bg-pink-700 text-white"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                {isSendingAll ? "Yuborilmoqda..." : `Barchasiga Tabrik SMS (${pendingBirthdaysCount})`}
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto border rounded-lg">
              {birthdayCandidates.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-xs space-y-1">
                  <p className="font-medium text-foreground">Ertangi kunda tug'ilgan kuni bo'ladigan bemorlar topilmadi.</p>
                  <p className="text-[11px]">Tug'ilgan kuniga 1 kun qolgan bemorlar ushbu ro'yxatda avtomatik ko'rinadi.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow className="text-xs">
                      <TableHead>Bemor</TableHead>
                      <TableHead>Telefon</TableHead>
                      <TableHead>Tug'ilgan sana</TableHead>
                      <TableHead>Yoshi</TableHead>
                      <TableHead>Tabrik SMS shabloni (10% chegirma)</TableHead>
                      <TableHead>Holat</TableHead>
                      <TableHead className="text-right">Amal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs">
                    {birthdayCandidates.map((b, idx) => (
                      <TableRow key={b.patientId}>
                        <TableCell className="font-semibold">
                          {b.patientName}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">
                          {b.phone}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {b.birthDate}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs font-semibold">
                            {b.age} yosh
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[280px]">
                          <p className="text-[11px] text-muted-foreground bg-muted/40 p-1.5 rounded truncate" title={b.smsText}>
                            {b.smsText}
                          </p>
                        </TableCell>
                        <TableCell>
                          {b.status === 'sent' && (
                            <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 text-[10px]">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Tabrik yuborildi
                            </Badge>
                          )}
                          {b.status === 'sending' && (
                            <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 text-[10px] animate-pulse">
                              Yuborilmoqda...
                            </Badge>
                          )}
                          {b.status === 'failed' && (
                            <Badge variant="outline" className="text-rose-600 border-rose-300 bg-rose-50 text-[10px]" title={b.error}>
                              <AlertCircle className="w-3 h-3 mr-1" /> Xato
                            </Badge>
                          )}
                          {b.status === 'pending' && (
                            <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-[10px]">
                              Yuborilmagan
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-pink-600 hover:text-pink-700 hover:bg-pink-50"
                            onClick={() => handleSendSingleBirthday(b, idx)}
                            disabled={b.status === 'sending' || b.status === 'sent' || isSendingAll}
                          >
                            <Send className="w-3 h-3 mr-1" /> Tabriklash
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
