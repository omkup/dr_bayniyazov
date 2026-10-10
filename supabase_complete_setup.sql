-- ============================================================
-- STOMACRM: TO'LIQ MA'LUMOTLAR BAZASI VA BOSHLANG'ICH SOZLAMALAR
-- Ushbu skriptni Supabase SQL Editor'ga nusxalab, "Run" tugmasini bosing!
-- ============================================================

-- 1. KENGAYTMALAR (EXTENSIONS)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUM TURLAR
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'reception', 'doctor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.visit_status AS ENUM ('NEW', 'SENT_TO_DOCTOR', 'IN_PROGRESS', 'DONE', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('UNPAID', 'PAID', 'PARTIAL', 'DEBT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('cash', 'card', 'transfer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. JADVALLARNI YARATISH

-- PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'doctor',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- PATIENTS
CREATE TABLE IF NOT EXISTS public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  birth_date DATE,
  gender TEXT CHECK (gender IN ('male', 'female')),
  address TEXT,
  notes TEXT,
  jshshir TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- SERVICES
CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_uz TEXT NOT NULL,
  base_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  duration_minutes INTEGER DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- VISIT ORDERS
CREATE TABLE IF NOT EXISTS public.visit_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  visit_datetime TIMESTAMPTZ NOT NULL,
  complaint TEXT,
  selected_service_id UUID REFERENCES public.services(id),
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  assigned_doctor_id UUID NOT NULL REFERENCES auth.users(id),
  status visit_status NOT NULL DEFAULT 'NEW',
  reception_note TEXT,
  payment_status payment_status NOT NULL DEFAULT 'UNPAID',
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  debt_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method payment_method,
  payment_updated_at TIMESTAMPTZ,
  payment_updated_by UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.visit_orders ENABLE ROW LEVEL SECURITY;

-- VISIT SERVICES
CREATE TABLE IF NOT EXISTS public.visit_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_order_id UUID NOT NULL REFERENCES public.visit_orders(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id),
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.visit_services ENABLE ROW LEVEL SECURITY;

-- CLINICAL RECORDS
CREATE TABLE IF NOT EXISTS public.clinical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_order_id UUID UNIQUE NOT NULL REFERENCES public.visit_orders(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES auth.users(id),
  diagnosis TEXT,
  procedures_done TEXT,
  anesthesia TEXT,
  medicines_used TEXT,
  tooth_map JSONB DEFAULT '[]'::jsonb,
  doctor_note TEXT,
  next_visit_datetime TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clinical_records ENABLE ROW LEVEL SECURITY;

-- PHOTO PROTOCOLS
CREATE TABLE IF NOT EXISTS public.photo_protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_order_id UUID NOT NULL REFERENCES public.visit_orders(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES auth.users(id),
  file_url TEXT NOT NULL,
  storage_path TEXT,
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.photo_protocols ENABLE ROW LEVEL SECURITY;

-- PAYMENT EVENTS
CREATE TABLE IF NOT EXISTS public.payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_order_id UUID NOT NULL REFERENCES public.visit_orders(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES auth.users(id),
  old_status TEXT,
  new_status TEXT,
  old_paid_amount NUMERIC(12,2),
  new_paid_amount NUMERIC(12,2),
  old_debt_amount NUMERIC(12,2),
  new_debt_amount NUMERIC(12,2),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- REMINDERS
CREATE TABLE IF NOT EXISTS public.reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_order_id UUID NOT NULL REFERENCES public.visit_orders(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'telegram')),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- VISIT STATUS HISTORY
CREATE TABLE IF NOT EXISTS public.visit_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_order_id UUID NOT NULL REFERENCES public.visit_orders(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.visit_status_history ENABLE ROW LEVEL SECURITY;

-- 4. FUNKSIYALAR VA TRIGGERLAR

-- has_role funksiyasi
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND role = _role AND is_active = true
  );
$$;

-- update_updated_at funksiyasi
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggerlar (updated_at)
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_patients_updated_at ON public.patients;
CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_services_updated_at ON public.services;
CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_visit_orders_updated_at ON public.visit_orders;
CREATE TRIGGER update_visit_orders_updated_at BEFORE UPDATE ON public.visit_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_clinical_records_updated_at ON public.clinical_records;
CREATE TRIGGER update_clinical_records_updated_at BEFORE UPDATE ON public.clinical_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Statustarixini kuzatish triggeri
CREATE OR REPLACE FUNCTION public.track_visit_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.visit_status_history (visit_order_id, old_status, new_status, changed_by)
    VALUES (NEW.id, OLD.status::text, NEW.status::text, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS track_visit_order_status ON public.visit_orders;
CREATE TRIGGER track_visit_order_status
  AFTER UPDATE ON public.visit_orders
  FOR EACH ROW EXECUTE FUNCTION public.track_visit_status_change();

-- Yangi user ro'yxatdan o'tganda profiling yaratish triggeri
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _role app_role;
  _has_any_users boolean;
  _meta_role text;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.profiles) INTO _has_any_users;

  IF NOT _has_any_users THEN
    _role := 'admin';
  ELSE
    _meta_role := NEW.raw_user_meta_data->>'role';
    IF _meta_role IN ('admin', 'reception', 'doctor') THEN
      _role := _meta_role::app_role;
    ELSE
      _role := 'doctor';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, role, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    _role,
    true
  )
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      email = EXCLUDED.email;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- DOCTOR_DIRECTORY VIEW
CREATE OR REPLACE VIEW public.doctor_directory AS
SELECT id, full_name, email, is_active
FROM public.profiles
WHERE role = 'doctor' AND is_active = true;

-- 5. RLS SIYOSATLARI (POLICIES)

-- PROFILES
DROP POLICY IF EXISTS "Profiles read own or admin" ON public.profiles;
CREATE POLICY "Profiles read own or admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR is_active = true);

DROP POLICY IF EXISTS "Admin manage profiles" ON public.profiles;
CREATE POLICY "Admin manage profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- SERVICES
DROP POLICY IF EXISTS "Authenticated users can read active services" ON public.services;
CREATE POLICY "Authenticated users can read active services" ON public.services
  FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admin manage services" ON public.services;
CREATE POLICY "Admin manage services" ON public.services
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- PATIENTS
DROP POLICY IF EXISTS "Admin full access patients" ON public.patients;
CREATE POLICY "Admin full access patients" ON public.patients
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Reception CRUD patients" ON public.patients;
CREATE POLICY "Reception CRUD patients" ON public.patients
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'reception'));

DROP POLICY IF EXISTS "Doctor read patients" ON public.patients;
CREATE POLICY "Doctor read patients" ON public.patients
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'doctor'));

-- VISIT ORDERS
DROP POLICY IF EXISTS "Admin full access orders" ON public.visit_orders;
CREATE POLICY "Admin full access orders" ON public.visit_orders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Reception CRUD orders" ON public.visit_orders;
CREATE POLICY "Reception CRUD orders" ON public.visit_orders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'reception'));

DROP POLICY IF EXISTS "Doctor read assigned orders" ON public.visit_orders;
CREATE POLICY "Doctor read assigned orders" ON public.visit_orders
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'doctor') AND assigned_doctor_id = auth.uid());

DROP POLICY IF EXISTS "Doctor update assigned orders" ON public.visit_orders;
CREATE POLICY "Doctor update assigned orders" ON public.visit_orders
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'doctor') AND assigned_doctor_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'doctor') AND assigned_doctor_id = auth.uid());

-- VISIT SERVICES
DROP POLICY IF EXISTS "Admin full access visit_services" ON public.visit_services;
CREATE POLICY "Admin full access visit_services" ON public.visit_services
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Reception CRUD visit_services" ON public.visit_services;
CREATE POLICY "Reception CRUD visit_services" ON public.visit_services
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'reception'));

DROP POLICY IF EXISTS "Doctor read and manage visit_services" ON public.visit_services;
CREATE POLICY "Doctor read and manage visit_services" ON public.visit_services
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'doctor') AND EXISTS (
      SELECT 1 FROM public.visit_orders
      WHERE visit_orders.id = visit_services.visit_order_id
      AND visit_orders.assigned_doctor_id = auth.uid()
    )
  );

-- CLINICAL RECORDS
DROP POLICY IF EXISTS "Admin full access records" ON public.clinical_records;
CREATE POLICY "Admin full access records" ON public.clinical_records
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Doctor CRUD own records" ON public.clinical_records;
CREATE POLICY "Doctor CRUD own records" ON public.clinical_records
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'doctor') AND doctor_id = auth.uid());

-- PAYMENT EVENTS
DROP POLICY IF EXISTS "Admin full access payment_events" ON public.payment_events;
CREATE POLICY "Admin full access payment_events" ON public.payment_events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Auth insert payment_events" ON public.payment_events;
CREATE POLICY "Auth insert payment_events" ON public.payment_events
  FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid());

DROP POLICY IF EXISTS "Doctor read payment_events" ON public.payment_events;
CREATE POLICY "Doctor read payment_events" ON public.payment_events
  FOR SELECT TO authenticated
  USING (true);

-- PHOTO PROTOCOLS
DROP POLICY IF EXISTS "Admin full access photo_protocols" ON public.photo_protocols;
CREATE POLICY "Admin full access photo_protocols" ON public.photo_protocols
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Doctor CRUD own photo_protocols" ON public.photo_protocols;
CREATE POLICY "Doctor CRUD own photo_protocols" ON public.photo_protocols
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'doctor') AND doctor_id = auth.uid());

-- REMINDERS
DROP POLICY IF EXISTS "Admin full access reminders" ON public.reminders;
CREATE POLICY "Admin full access reminders" ON public.reminders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Reception read reminders" ON public.reminders;
CREATE POLICY "Reception read reminders" ON public.reminders
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'reception'));

-- STATUS HISTORY
DROP POLICY IF EXISTS "Status history read" ON public.visit_status_history;
CREATE POLICY "Status history read" ON public.visit_status_history
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Status history insert" ON public.visit_status_history;
CREATE POLICY "Status history insert" ON public.visit_status_history
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 6. STORAGE BUCKET (photo-protocols)
INSERT INTO storage.buckets (id, name, public)
VALUES ('photo-protocols', 'photo-protocols', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Doctor upload photos" ON storage.objects;
CREATE POLICY "Doctor upload photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'photo-protocols');

DROP POLICY IF EXISTS "Doctor and Admin read photos" ON storage.objects;
CREATE POLICY "Doctor and Admin read photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'photo-protocols');

DROP POLICY IF EXISTS "Admin delete photos" ON storage.objects;
CREATE POLICY "Admin delete photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'photo-protocols' AND public.has_role(auth.uid(), 'admin'));

-- 7. BOSHLANG'ICH XIZMATLAR (SERVICES DATA)
INSERT INTO public.services (name_uz, base_price, duration_minutes, is_active)
VALUES
  ('Birlamchi ko''rik va maslahat', 50000, 20, true),
  ('Fotopolimer plomba (yengil)', 200000, 30, true),
  ('Fotopolimer plomba (chuqur karies)', 350000, 45, true),
  ('Kanal davolash (1 kanalli)', 250000, 45, true),
  ('Kanal davolash (3 kanalli)', 500000, 60, true),
  ('Tishni sug''urish (oddiy)', 150000, 30, true),
  ('Tishni sug''urish (jarrohlik/aql tishi)', 400000, 60, true),
  ('Professional tozalash (ultratovush + AirFlow)', 300000, 45, true),
  ('Metall-keramika toji', 600000, 60, true),
  ('Tsirkoniy toji', 1200000, 60, true),
  ('Implant o''rnatish (Osstem)', 3500000, 90, true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 8. MAVJUD FOYDALANUVCHILARNI ADMIN QILIB SOZLASH
-- Siz Dashboard orqali yaratgan foydalanuvchini avtomatik Admin qiladi!
-- ============================================================
INSERT INTO public.profiles (id, full_name, email, role, is_active)
SELECT 
  id, 
  COALESCE(raw_user_meta_data->>'full_name', email, 'Bosh Administrator'), 
  COALESCE(email, ''), 
  'admin'::public.app_role, 
  true
FROM auth.users
ON CONFLICT (id) DO UPDATE 
SET role = 'admin'::public.app_role, is_active = true;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role 
FROM auth.users
ON CONFLICT (user_id, role) DO NOTHING;
