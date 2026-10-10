-- ============================================================
-- ADMIN AKKAUNTINI TO'LIQ VA TO'G'RI QAYTA YARATISH
-- Supabase Auth tizimi auth.identities jadvalini ham talab qiladi.
-- Ushbu skriptni Supabase SQL Editor'da ishga tushiring:
-- ============================================================

DO $$
DECLARE
  _admin_id UUID := gen_random_uuid();
  _email TEXT := 'admin@stoma.uz';
  _password TEXT := 'Admin123!';
  _encrypted_pwd TEXT := crypt(_password, gen_salt('bf'));
BEGIN
  -- 1. Avvalgi xato yozuvlarni tozalash
  DELETE FROM auth.identities WHERE user_id IN (SELECT id FROM auth.users WHERE email = _email);
  DELETE FROM public.user_roles WHERE user_id IN (SELECT id FROM auth.users WHERE email = _email);
  DELETE FROM public.profiles WHERE email = _email;
  DELETE FROM auth.users WHERE email = _email;

  -- 2. auth.users jadvaliga to'liq ma'lumotlar bilan kiritish
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  ) VALUES (
    _admin_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    _email,
    _encrypted_pwd,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Bosh Administrator","role":"admin"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  -- 3. auth.identities jadvaliga kiritish (Supabase Auth tizimi buni qat'iy talab qiladi!)
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    _admin_id,
    _admin_id,
    format('{"sub":"%s","email":"%s"}', _admin_id, _email)::jsonb,
    'email',
    now(),
    now(),
    now()
  );

  -- 4. public.profiles ga kiritish
  INSERT INTO public.profiles (id, full_name, email, role, is_active)
  VALUES (
    _admin_id,
    'Bosh Administrator',
    _email,
    'admin',
    true
  )
  ON CONFLICT (id) DO UPDATE
  SET role = 'admin', is_active = true;

  -- 5. public.user_roles ga kiritish
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_admin_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RAISE NOTICE 'Admin akkaunt muvaffaqiyatli yaratildi: % / %', _email, _password;
END $$;
