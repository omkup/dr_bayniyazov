# StomaCRM — Stomatologiya Klinikasi EMR va Boshqaruv Tizimi

Stomatologiya klinikalari uchun mo'ljallangan zamonaviy, tezkor va xavfsiz elektron qabul, odontogramma (tish xaritasi) va moliya boshqaruvi tizimi.

## 🚀 Texnologiyalar (Tech Stack)
- **Frontend**: React 18, TypeScript, Vite (SWC)
- **UI & Dizayn**: Tailwind CSS, Radix UI (Shadcn/UI), Lucide Icons
- **Backend & Baza**: Supabase (PostgreSQL, Auth, RLS, Storage, Edge Functions)
- **Kesh & State**: TanStack React Query, React Context
- **PWA**: iPad / planshet va mobil qurilmalarda mustaqil (standalone) ilova sifatida ishlash imkoniyati
- **Eksport**: Excel va CSV hisobotlari

## 👥 Rollar va Huquqlar (RBAC)
1. **Administrator (`admin`)**:
   - Foydalanuvchilarni qo'shish va parolini yangilash (xodimlar boshqaruvi)
   - Narxlar va xizmatlar ro'yxati
   - Barcha buyurtmalar, hisobotlar va umumiy qarzlar monitoringi
2. **Registratura (`reception`)**:
   - Bemorlar ro'yxati va anketasi
   - Shifokorlar bandligi taqvimi (intervalli jadval)
   - Yangi qabul yozish va navbatni shifokorga yo'naltirish
3. **Shifokor (`doctor`)**:
   - Bemor qabullari va ko'rik
   - Interaktiv tish xaritasi (FDI tish raqamlash)
   - Rentgen va fotosuratlarni yuklash
   - To'lov va muolajalar kiritish

## ⚙️ Mahalliy ishga tushirish (Local Setup)

1. Bog'liqliklarni o'rnatish:
```sh
npm install
```

2. `.env` faylini sozlash:
```env
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key"
```

3. Dasturni ishga tushirish:
```sh
npm run dev
```

4. Build qilish:
```sh
npm run build
```
