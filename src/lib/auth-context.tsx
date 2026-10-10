import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

type AppRole = 'admin' | 'reception' | 'doctor';

interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: AppRole;
  is_active: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  authLoading: boolean;
  profileLoading: boolean;
  /** @deprecated use authLoading || profileLoading */
  loading: boolean;
  lastError: string | null;
  profileRowFound: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  retryProfile: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_TIMEOUT_MS = 6000;
const PROFILE_TIMEOUT_MS = 6000;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [profileRowFound, setProfileRowFound] = useState(false);
  const initialized = useRef(false);

  const fetchAndProvisionProfile = useCallback(async (currentUser: User) => {
    setProfileLoading(true);
    setLastError(null);
    setProfileRowFound(false);

    const timeout = setTimeout(() => {
      setLastError('Profil yuklanishi cho\'zildi. Qayta urinib ko\'ring.');
      setProfileLoading(false);
    }, PROFILE_TIMEOUT_MS);

    try {
      // 1. Read profile (profiles.role is the single source of truth)
      let { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (profileError) {
        console.error('Profile fetch error:', profileError.message);
        setLastError(`Profil: ${profileError.message}`);
        clearTimeout(timeout);
        setProfileLoading(false);
        return;
      }

      // 2. Profile must be pre-created by Admin via DB triggers or Admin panel
      if (!profileData) {
        setLastError("Foydalanuvchi profili topilmadi yoki tasdiqlanmagan. Administrator bilan bog'laning.");
        setProfile(null);
        setRole(null);
        setProfileRowFound(false);
        clearTimeout(timeout);
        setProfileLoading(false);
        return;
      }

      const p = profileData as Profile;
      if (!p.is_active) {
        setLastError("Ushbu hisob administrator tomonidan nofaol qilingan.");
        setProfile(p);
        setRole(null);
        setProfileRowFound(true);
        clearTimeout(timeout);
        setProfileLoading(false);
        return;
      }

      setProfile(p);
      setProfileRowFound(true);
      setRole(p.role || null);
      if (!p.role) {
        console.warn('No role found for user', currentUser.id);
        setLastError('Admin rolni tayinlamagan');
      }
    } catch (err: any) {
      console.error('fetchAndProvisionProfile exception:', err);
      setLastError(err.message || 'Noma\'lum xatolik');
    } finally {
      clearTimeout(timeout);
      setProfileLoading(false);
    }
  }, []);

  // Retry handler
  const retryProfile = useCallback(() => {
    if (user) {
      fetchAndProvisionProfile(user);
    }
  }, [user, fetchAndProvisionProfile]);

  // Fetch profile whenever user changes
  useEffect(() => {
    if (user) {
      fetchAndProvisionProfile(user);
    } else {
      setProfile(null);
      setRole(null);
      setProfileRowFound(false);
      setProfileLoading(false);
    }
  }, [user, fetchAndProvisionProfile]);

  // Auth initialization — only reads session, sets authLoading
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    let mounted = true;

    const authTimeout = setTimeout(() => {
      if (mounted && authLoading) {
        console.warn('Auth timeout — forcing authLoading=false');
        setLastError('Sessiyani tekshirish cho\'zildi. Qayta kirib ko\'ring.');
        setAuthLoading(false);
      }
    }, AUTH_TIMEOUT_MS);

    // 1. Set up listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setAuthLoading(false);
    });

    // 2. Then check existing session
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      if (!mounted) return;
      setSession(existingSession);
      setUser(existingSession?.user ?? null);
      setAuthLoading(false);
    }).catch((err) => {
      console.error('getSession error:', err);
      if (mounted) {
        setLastError(err.message);
        setAuthLoading(false);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(authTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    setLastError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setLastError(error.message);
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
    setLastError(null);
    setProfileRowFound(false);
  };

  const loading = authLoading || profileLoading;

  return (
    <AuthContext.Provider value={{
      user, session, profile, role,
      authLoading, profileLoading, loading,
      lastError, profileRowFound,
      signIn, signOut, retryProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
