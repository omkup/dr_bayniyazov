import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Pencil, Trash2, Download, FileSpreadsheet, FolderClock, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { exportToExcel } from '@/lib/export-utils';

const AdminPatients = () => {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [editPatient, setEditPatient] = useState<any>(null);
  const [editForm, setEditForm] = useState({ full_name: '', phone: '', jshshir: '', birth_date: '', gender: '', address: '', notes: '' });

  const fetchPatients = async () => {
    let query = supabase.from('patients').select('*').eq('is_deleted', false).order('created_at', { ascending: false });
    if (search) query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,jshshir.ilike.%${search}%`);
    const { data } = await query;
    setPatients(data || []);
  };

  useEffect(() => { fetchPatients(); }, [search]);

  const openEdit = (p: any) => {
    setEditPatient(p);
    setEditForm({
      full_name: p.full_name || '', phone: p.phone || '', jshshir: p.jshshir || '',
      birth_date: p.birth_date || '', gender: p.gender || '', address: p.address || '', notes: p.notes || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editPatient) return;
    if (editForm.jshshir && !/^\d{14}$/.test(editForm.jshshir)) {
      toast.error("JSHSHIR 14 ta raqamdan iborat bo'lishi kerak");
      return;
    }
    const { error } = await supabase.from('patients').update({
      full_name: editForm.full_name, phone: editForm.phone, jshshir: editForm.jshshir || null,
      birth_date: editForm.birth_date || null, gender: editForm.gender || null,
      address: editForm.address || null, notes: editForm.notes || null,
    }).eq('id', editPatient.id);
    if (error) toast.error("Xatolik", { description: error.message });
    else { toast.success("Bemor yangilandi"); setEditPatient(null); fetchPatients(); }
  };

  const handleDelete = async (p: any) => {
    if (!confirm(`${p.full_name} ni o'chirmoqchimisiz?`)) return;
    await supabase.from('patients').update({ is_deleted: true }).eq('id', p.id);
    toast.success("Bemor o'chirildi");
    fetchPatients();
  };

  const patientHeaders = {
    full_name: 'Ism familiya', phone: 'Telefon', jshshir: 'JSHSHIR',
    birth_date: "Tug'ilgan sana", gender: 'Jinsi', address: 'Manzil', notes: 'Izoh',
  };

  const exportPatients = () => exportToExcel({ data: patients, headers: patientHeaders, filename: 'bemorlar' });

  const exportOrders = async () => {
    const { data } = await supabase.from('visit_orders').select('id, patient_id, visit_datetime, status, price, paid_amount, debt_amount, payment_status, payment_method, complaint, created_at').order('created_at', { ascending: false });
    if (data) exportToExcel({
      data, filename: 'buyurtmalar',
      headers: {
        visit_datetime: 'Tashrif sanasi', status: 'Holat', price: 'Narx',
        paid_amount: "To'langan", debt_amount: 'Qarz', payment_status: "To'lov holati",
        payment_method: "To'lov usuli", complaint: 'Shikoyat', created_at: 'Yaratilgan',
      },
    });
  };

  const exportClinical = async () => {
    const { data } = await supabase.from('clinical_records').select('id, visit_order_id, doctor_id, diagnosis, procedures_done, anesthesia, medicines_used, next_visit_datetime, created_at').order('created_at', { ascending: false });
    if (data) exportToExcel({
      data, filename: 'klinik_yozuvlar',
      headers: {
        diagnosis: 'Diagnoz', procedures_done: 'Muolajalar', anesthesia: 'Anesteziya',
        medicines_used: 'Dorilar', next_visit_datetime: 'Keyingi qabul', created_at: 'Yaratilgan',
      },
    });
  };

  return (
    <DashboardLayout title="Bemorlar boshqaruvi">
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Ism, telefon yoki JSHSHIR..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportPatients}><FileSpreadsheet className="w-4 h-4 mr-1" />Bemorlar</Button>
          <Button variant="outline" size="sm" onClick={exportOrders}><FileSpreadsheet className="w-4 h-4 mr-1" />Buyurtmalar</Button>
          <Button variant="outline" size="sm" onClick={exportClinical}><FileSpreadsheet className="w-4 h-4 mr-1" />Klinik</Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Excel (.xlsx) formatda yuklanadi. Agar yuklanmasa, CSV faylni Excel'da ochish mumkin.</p>

      <div className="bg-card rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ism</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead>JSHSHIR</TableHead>
              <TableHead>Jinsi</TableHead>
              <TableHead>Manzil</TableHead>
              <TableHead className="text-right">Tibbiy karta va Amallar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {patients.map(p => (
              <TableRow key={p.id} className="hover:bg-muted/40 transition-colors">
                <TableCell className="font-semibold cursor-pointer text-primary hover:underline" onClick={() => navigate(`/admin/patients/${p.id}/history`)}>
                  {p.full_name}
                </TableCell>
                <TableCell>{p.phone}</TableCell>
                <TableCell className="text-muted-foreground">{p.jshshir || '—'}</TableCell>
                <TableCell>{p.gender === 'male' ? 'Erkak' : p.gender === 'female' ? 'Ayol' : '—'}</TableCell>
                <TableCell className="text-muted-foreground">{p.address || '—'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1.5 justify-end items-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs font-medium text-primary border-primary/30 hover:bg-primary/10"
                      onClick={() => navigate(`/admin/patients/${p.id}/history`)}
                    >
                      <FolderClock className="w-3.5 h-3.5 mr-1 text-primary" />
                      Tarix va fotolar
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)} title="Tahrirlash">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(p)} title="O'chirish">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {patients.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Bemorlar topilmadi</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editPatient} onOpenChange={o => !o && setEditPatient(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bemorni tahrirlash</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Ism familiya</Label><Input value={editForm.full_name} onChange={e => setEditForm(p => ({...p, full_name: e.target.value}))} /></div>
            <div className="space-y-1"><Label>Telefon</Label><Input value={editForm.phone} onChange={e => setEditForm(p => ({...p, phone: e.target.value}))} /></div>
            <div className="space-y-1"><Label>JSHSHIR</Label><Input value={editForm.jshshir} onChange={e => setEditForm(p => ({...p, jshshir: e.target.value.replace(/\D/g, '').slice(0, 14)}))} maxLength={14} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Tug'ilgan sana</Label><Input type="date" value={editForm.birth_date} onChange={e => setEditForm(p => ({...p, birth_date: e.target.value}))} /></div>
              <div className="space-y-1"><Label>Jinsi</Label>
                <Select value={editForm.gender} onValueChange={v => setEditForm(p => ({...p, gender: v}))}>
                  <SelectTrigger><SelectValue placeholder="Tanlang" /></SelectTrigger>
                  <SelectContent><SelectItem value="male">Erkak</SelectItem><SelectItem value="female">Ayol</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1"><Label>Manzil</Label><Input value={editForm.address} onChange={e => setEditForm(p => ({...p, address: e.target.value}))} /></div>
            <div className="space-y-1"><Label>Izoh</Label><Textarea value={editForm.notes} onChange={e => setEditForm(p => ({...p, notes: e.target.value}))} rows={2} /></div>
            <Button onClick={handleSaveEdit} className="w-full">Saqlash</Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdminPatients;
