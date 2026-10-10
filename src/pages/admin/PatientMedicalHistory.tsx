import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { uz } from 'date-fns/locale';
import {
  User, Phone, Calendar, ArrowLeft, Image as ImageIcon,
  Printer, Stethoscope, AlertCircle, FileText, CheckCircle2,
  Clock, DollarSign, Send, Eye, ShieldAlert, Sparkles, MapPin, Hash
} from 'lucide-react';
import { sendSms } from '@/lib/httpsms';
import { toast } from 'sonner';

interface VisitDetail {
  id: string;
  visit_datetime: string;
  status: string;
  complaint?: string;
  price: number;
  paid_amount: number;
  debt_amount: number;
  payment_status: string;
  reception_note?: string;
  doctor_name?: string;
  services: Array<{ name: string; price: number; quantity: number }>;
  clinical_record?: {
    diagnosis?: string;
    procedures_done?: string;
    anesthesia?: string;
    medicines_used?: string;
    doctor_note?: string;
    next_visit_datetime?: string;
    tooth_map?: Array<{ tooth_number: number; procedure: string; notes?: string }>;
  };
  photos: Array<{
    id: string;
    type: string;
    file_url: string;
    storage_path?: string;
    signed_url?: string;
    created_at: string;
  }>;
}

const statusLabels: Record<string, string> = {
  NEW: 'Yangi qabul',
  SENT_TO_DOCTOR: 'Shifokorga yuborilgan',
  IN_PROGRESS: 'Jarayonda',
  DONE: 'Bajarildi / Yakunlangan',
  CANCELLED: 'Bekor qilingan',
};

const statusColors: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  SENT_TO_DOCTOR: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  IN_PROGRESS: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  DONE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  CANCELLED: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
};

const PatientMedicalHistory = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [patient, setPatient] = useState<any>(null);
  const [visits, setVisits] = useState<VisitDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  // Tezkor SMS yuborish
  const [smsSending, setSmsSending] = useState(false);

  useEffect(() => {
    if (id) {
      fetchPatientAndHistory();
    }
  }, [id]);

  const fetchPatientAndHistory = async () => {
    setLoading(true);
    try {
      // 1. Bemor ma'lumotlarini olish
      const { data: patientData, error: pErr } = await supabase
        .from('patients')
        .select('*')
        .eq('id', id)
        .single();

      if (pErr) throw pErr;
      setPatient(patientData);

      // 2. Ushbu bemorning barcha buyurtmalarini olish (eng yangisidan eskiga)
      const { data: ordersData, error: oErr } = await supabase
        .from('visit_orders')
        .select('*')
        .eq('patient_id', id)
        .order('visit_datetime', { ascending: false });

      if (oErr) throw oErr;

      const orderList = ordersData || [];
      const orderIds = orderList.map(o => o.id);
      const doctorIds = [...new Set(orderList.map(o => o.assigned_doctor_id))];

      // 3. Shifokorlar, xizmatlar, klinik yozuvlar va rasmlarni parallel olish
      const [doctorsRes, servicesRes, clinicalRes, photosRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name').in('id', doctorIds),
        supabase.from('visit_services').select('visit_order_id, price, quantity, services(name_uz)').in('visit_order_id', orderIds),
        supabase.from('clinical_records').select('*').in('visit_order_id', orderIds),
        supabase.from('photo_protocols').select('*').in('visit_order_id', orderIds).order('created_at', { ascending: true }),
      ]);

      const docMap = Object.fromEntries((doctorsRes.data || []).map(d => [d.id, d.full_name]));

      // Visit services map
      const servicesMap: Record<string, Array<{ name: string; price: number; quantity: number }>> = {};
      (servicesRes.data || []).forEach((vs: any) => {
        if (!servicesMap[vs.visit_order_id]) servicesMap[vs.visit_order_id] = [];
        servicesMap[vs.visit_order_id].push({
          name: vs.services?.name_uz || "Xizmat",
          price: Number(vs.price || 0),
          quantity: Number(vs.quantity || 1),
        });
      });

      // Clinical record map
      const clinicalMap = Object.fromEntries(
        (clinicalRes.data || []).map((cr: any) => [
          cr.visit_order_id,
          {
            diagnosis: cr.diagnosis,
            procedures_done: cr.procedures_done,
            anesthesia: cr.anesthesia,
            medicines_used: cr.medicines_used,
            doctor_note: cr.doctor_note,
            next_visit_datetime: cr.next_visit_datetime,
            tooth_map: Array.isArray(cr.tooth_map) ? cr.tooth_map : [],
          },
        ])
      );

      // Photos map
      const photosMap: Record<string, any[]> = {};
      for (const ph of photosRes.data || []) {
        if (!photosMap[ph.visit_order_id]) photosMap[ph.visit_order_id] = [];

        // Signed URL yaratish
        let finalUrl = ph.file_url;
        const storagePath = ph.storage_path || (ph.file_url?.includes('/photo-protocols/') ? ph.file_url.split('/photo-protocols/')[1] : null);

        if (storagePath) {
          const { data: signData } = await supabase.storage
            .from('photo-protocols')
            .createSignedUrl(storagePath, 3600);
          if (signData?.signedUrl) finalUrl = signData.signedUrl;
        }

        photosMap[ph.visit_order_id].push({
          ...ph,
          signed_url: finalUrl,
        });
      }

      // 4. Barchasini birlashtirish
      const detailedVisits: VisitDetail[] = orderList.map(o => ({
        id: o.id,
        visit_datetime: o.visit_datetime,
        status: o.status,
        complaint: o.complaint,
        price: Number(o.price || 0),
        paid_amount: Number(o.paid_amount || 0),
        debt_amount: Number(o.debt_amount || 0),
        payment_status: o.payment_status,
        reception_note: o.reception_note,
        doctor_name: docMap[o.assigned_doctor_id] || "Noma'lum shifokor",
        services: servicesMap[o.id] || [],
        clinical_record: clinicalMap[o.id],
        photos: photosMap[o.id] || [],
      }));

      setVisits(detailedVisits);
    } catch (err: any) {
      console.error("Bemor tarixini yuklashda xatolik:", err);
      toast.error("Ma'lumotlarni yuklashda xatolik", { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSendQuickSms = async () => {
    if (!patient?.phone) {
      toast.error("Bemor telefon raqami mavjud emas");
      return;
    }
    setSmsSending(true);
    const text = `Hurmatli ${patient.full_name}, Dr.Bayniyazov stomatologiya klinikasi sizga sog'liq tilaydi! Savollar yoki navbat bo'yicha biz bilan bog'lanishingiz mumkin.`;
    const res = await sendSms({
      to: patient.phone,
      content: text,
    });

    if (res.success) {
      toast.success("SMS yuborildi!", { description: `${patient.phone} raqamiga yuborildi` });
    } else {
      toast.error("SMS yuborilmadi", { description: res.error });
    }
    setSmsSending(false);
  };

  if (loading) {
    return (
      <DashboardLayout title="Bemor tibbiy kartasi">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-pulse text-muted-foreground">Tibbiy karta ma'lumotlari va rasmlar yuklanmoqda...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (!patient) {
    return (
      <DashboardLayout title="Bemor topilmadi">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Bemor ma'lumotlari topilmadi.</p>
          <Button onClick={() => navigate('/admin/patients')} className="mt-4">
            Bemorlar ro'yxatiga qaytish
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const totalSpent = visits.reduce((sum, v) => sum + v.paid_amount, 0);
  const totalDebt = visits.reduce((sum, v) => sum + v.debt_amount, 0);
  const totalPhotos = visits.reduce((sum, v) => sum + v.photos.length, 0);

  return (
    <DashboardLayout title="Bemorning elektron tibbiy kartasi">
      <div className="space-y-6 max-w-6xl mx-auto pb-12">
        {/* Yuqori boshqaruv paneli */}
        <div className="flex items-center justify-between gap-4 flex-wrap print:hidden">
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/patients')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Bemorlar ro'yxati
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSendQuickSms} disabled={smsSending}>
              <Send className="w-4 h-4 mr-1 text-primary" />
              {smsSending ? "Yuborilmoqda..." : "SMS yuborish"}
            </Button>
            <Button variant="default" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-2" /> Chop etish (Print / PDF)
            </Button>
          </div>
        </div>

        {/* Bemor haqida umumiy karta (Header Card) */}
        <Card className="border shadow-sm bg-card overflow-hidden">
          <div className="bg-primary/5 p-6 border-b">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl stoma-gradient flex items-center justify-center text-primary-foreground font-bold text-lg shadow-sm">
                    {patient.full_name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-foreground">{patient.full_name}</h1>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-primary" /> {patient.phone}
                      </span>
                      {patient.birth_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" /> {patient.birth_date}
                        </span>
                      )}
                      {patient.jshshir && (
                        <span className="flex items-center gap-1">
                          <Hash className="w-3.5 h-3.5" /> JSHSHIR: {patient.jshshir}
                        </span>
                      )}
                      {patient.gender && (
                        <Badge variant="outline">
                          {patient.gender === 'male' ? 'Erkak' : 'Ayol'}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {patient.address && (
                  <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" /> {patient.address}
                  </p>
                )}
                {patient.notes && (
                  <div className="mt-3 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                    <span><strong>Bemor haqida maxsus qayd:</strong> {patient.notes}</span>
                  </div>
                )}
              </div>

              {/* Moliya va ko'rsatkichlar */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="bg-background border rounded-xl p-3 text-center min-w-[110px]">
                  <p className="text-xs text-muted-foreground">Tashriflar</p>
                  <p className="text-xl font-bold text-foreground mt-0.5">{visits.length} ta</p>
                </div>
                <div className="bg-background border rounded-xl p-3 text-center min-w-[110px]">
                  <p className="text-xs text-muted-foreground">Rentgen / Fotolar</p>
                  <p className="text-xl font-bold text-foreground mt-0.5">{totalPhotos} ta</p>
                </div>
                <div className="bg-background border rounded-xl p-3 text-center min-w-[120px]">
                  <p className="text-xs text-muted-foreground">To'langan</p>
                  <p className="text-lg font-bold text-emerald-600 mt-0.5">{totalSpent.toLocaleString()} so'm</p>
                </div>
                {totalDebt > 0 && (
                  <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 rounded-xl p-3 text-center min-w-[120px]">
                    <p className="text-xs text-rose-600 font-medium">Qarzdorlik</p>
                    <p className="text-lg font-bold text-rose-600 mt-0.5">{totalDebt.toLocaleString()} so'm</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* XRONOLOGIK TASHRIFLAR VA MUOLAJALAR TARIXI */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Tashriflar va ko'rsatilgan muolajalar xronologiyasi ({visits.length})
            </h2>
            <span className="text-xs text-muted-foreground">
              Eng so'nggi tashrifdan boshlab ketma-ketlikda
            </span>
          </div>

          {visits.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              Ushbu bemor uchun hali hech qanday tashrif yoki qabul ro'yxatga olinmagan.
            </Card>
          ) : (
            visits.map((visit, index) => {
              const visitDate = new Date(visit.visit_datetime);
              return (
                <Card key={visit.id} className="border shadow-xs hover:shadow-md transition-shadow relative overflow-hidden">
                  {/* Tartib raqami ko'rsatkichi */}
                  <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-primary"></div>

                  <CardHeader className="pb-3 border-b bg-muted/20">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                          #{visits.length - index}
                        </span>
                        <div>
                          <CardTitle className="text-base font-bold flex items-center gap-2">
                            {format(visitDate, 'd MMMM, yyyy — HH:mm', { locale: uz })}
                            <Badge className={statusColors[visit.status]}>
                              {statusLabels[visit.status] || visit.status}
                            </Badge>
                          </CardTitle>
                          <CardDescription className="flex items-center gap-2 mt-0.5">
                            <Stethoscope className="w-3.5 h-3.5 text-primary" />
                            Qabul qilgan shifokor: <strong className="text-foreground">{visit.doctor_name}</strong>
                          </CardDescription>
                        </div>
                      </div>

                      {/* Moliyaviy qisqacha ko'rsatkich */}
                      <div className="text-right text-xs">
                        <div className="font-semibold text-sm">
                          Umumiy summa: {visit.price.toLocaleString()} so'm
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 justify-end">
                          <span className="text-emerald-600 font-medium">To'landi: {visit.paid_amount.toLocaleString()}</span>
                          {visit.debt_amount > 0 && (
                            <span className="text-rose-600 font-bold">Qarz: {visit.debt_amount.toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-4 space-y-4">
                    {/* 1. Shikoyat */}
                    {visit.complaint && (
                      <div className="rounded-lg p-3 bg-muted/40 border text-sm">
                        <span className="font-semibold text-foreground block text-xs uppercase tracking-wider mb-1 text-muted-foreground">
                          Bemor shikoyati (Anamnez):
                        </span>
                        <p className="text-foreground">{visit.complaint}</p>
                      </div>
                    )}

                    {/* 2. Klinik ma'lumotlar (Tashxis, Muolajalar, Dorilar) */}
                    {visit.clinical_record ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        {visit.clinical_record.diagnosis && (
                          <div className="p-3 rounded-lg border bg-card">
                            <span className="text-xs font-semibold text-primary block uppercase tracking-wider mb-1">
                              Qo'yilgan tashxis (Diagnoz):
                            </span>
                            <p className="font-medium text-foreground">{visit.clinical_record.diagnosis}</p>
                          </div>
                        )}

                        {visit.clinical_record.procedures_done && (
                          <div className="p-3 rounded-lg border bg-card">
                            <span className="text-xs font-semibold text-primary block uppercase tracking-wider mb-1">
                              Bajarilgan muolajalar:
                            </span>
                            <p className="font-medium text-foreground">{visit.clinical_record.procedures_done}</p>
                          </div>
                        )}

                        {visit.clinical_record.anesthesia && (
                          <div className="p-3 rounded-lg border bg-card">
                            <span className="text-xs font-semibold text-muted-foreground block uppercase tracking-wider mb-1">
                              Qo'llanilgan anesteziya:
                            </span>
                            <p className="text-foreground">{visit.clinical_record.anesthesia}</p>
                          </div>
                        )}

                        {visit.clinical_record.medicines_used && (
                          <div className="p-3 rounded-lg border bg-card">
                            <span className="text-xs font-semibold text-muted-foreground block uppercase tracking-wider mb-1">
                              Ishlatilgan dorilar / materiallar:
                            </span>
                            <p className="text-foreground">{visit.clinical_record.medicines_used}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        Shifokor tomonidan klinik yozuvlar hali kiritilmagan.
                      </p>
                    )}

                    {/* 3. Tishlar xaritasi (Tooth map / Odontogramma) */}
                    {visit.clinical_record?.tooth_map && visit.clinical_record.tooth_map.length > 0 && (
                      <div className="rounded-lg p-3 border bg-muted/20">
                        <span className="text-xs font-semibold text-foreground uppercase tracking-wider block mb-2">
                          Muolaja qilingan tishlar (Odontogramma):
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {visit.clinical_record.tooth_map.map((t, idx) => (
                            <Badge key={idx} variant="secondary" className="px-2.5 py-1 text-xs font-medium">
                              <strong className="text-primary mr-1.5">Tish #{t.tooth_number}:</strong>
                              <span>{t.procedure}</span>
                              {t.notes && <span className="opacity-70 ml-1">({t.notes})</span>}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 4. Ko'rsatilgan xizmatlar ro'yxati */}
                    {visit.services.length > 0 && (
                      <div className="rounded-lg border p-3 bg-card">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                          Xizmatlar va hisob-kitob:
                        </span>
                        <div className="divide-y text-xs">
                          {visit.services.map((s, idx) => (
                            <div key={idx} className="py-1.5 flex items-center justify-between">
                              <span className="font-medium text-foreground">{s.name} x {s.quantity}</span>
                              <span className="font-mono text-muted-foreground">{(s.price * s.quantity).toLocaleString()} so'm</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 5. Shifokor eslatmasi / xulosasi */}
                    {visit.clinical_record?.doctor_note && (
                      <div className="p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 text-xs text-blue-900 dark:text-blue-300">
                        <strong>Shifokor xulosasi / tavsiyalari:</strong> {visit.clinical_record.doctor_note}
                      </div>
                    )}

                    {/* 6. FOTO VA RENTGEN RASMLARI (MUHIM!) */}
                    {visit.photos.length > 0 && (
                      <div className="border rounded-xl p-4 bg-muted/10 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                            <ImageIcon className="w-4 h-4 text-primary" />
                            Tashrif vaqtida olingan rentgen va fotosuratlar ({visit.photos.length} ta)
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            Kattalashtirish uchun rasm ustiga bosing
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                          {visit.photos.map((photo) => (
                            <div
                              key={photo.id}
                              className="group relative rounded-lg border bg-card overflow-hidden cursor-pointer shadow-2xs hover:shadow-md transition-all aspect-square"
                              onClick={() => setSelectedPhoto(photo.signed_url || photo.file_url)}
                            >
                              <img
                                src={photo.signed_url || photo.file_url}
                                alt={photo.type || "Tish surati"}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <Eye className="w-5 h-5" />
                              </div>
                              <span className="absolute bottom-1 left-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded truncate text-center capitalize">
                                {photo.type || "Rasm"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {visit.photos.length === 0 && (
                      <p className="text-xs text-muted-foreground italic flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5" /> Ushbu tashrifda rentgen yoki rasm yuklanmagan.
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Rasmni to'liq ekranda ko'rish Modali (Lightbox / Preview) */}
        <Dialog open={!!selectedPhoto} onOpenChange={(o) => !o && setSelectedPhoto(null)}>
          <DialogContent className="max-w-3xl p-2 bg-black/95 border-none text-white">
            <DialogHeader className="p-2">
              <DialogTitle className="text-sm font-normal text-muted-foreground">
                Tish rentgen / fotoprotokol surati
              </DialogTitle>
              <DialogDescription className="sr-only">
                Kattalashtirilgan rentgen yoki fotoprotokol surati
              </DialogDescription>
            </DialogHeader>
            {selectedPhoto && (
              <div className="flex flex-col items-center justify-center p-2">
                <img
                  src={selectedPhoto}
                  alt="Kattalashtirilgan rasm"
                  className="max-h-[75vh] w-auto max-w-full rounded object-contain"
                />
                <div className="flex gap-2 mt-4">
                  <a
                    href={selectedPhoto}
                    target="_blank"
                    rel="noreferrer"
                    download="stoma-photo.jpg"
                    className="inline-flex items-center px-4 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Asl nusxani ochish / Yuklab olish
                  </a>
                  <Button variant="outline" size="sm" onClick={() => setSelectedPhoto(null)} className="text-foreground">
                    Yopish
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default PatientMedicalHistory;
