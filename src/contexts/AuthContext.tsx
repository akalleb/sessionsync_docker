import React, { createContext, useCallback, useEffect, useRef, useState, useContext } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Database, Tables, Enums } from '@/integrations/supabase/types';

type Profile = Tables<'profiles'>;
type UserRole = { role: Enums<'app_role'> };

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  vereador: { id: string; cargo_mesa: string | null } | null;
  roles: UserRole[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, nome: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: Enums<'app_role'>) => boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

import { toast } from 'sonner';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vereador, setVereador] = useState<{ id: string; cargo_mesa: string | null } | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleSigningOutRef = useRef(false);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, camara:camaras(*)')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching profile:', error);
        return;
      }

      if (data) {
        setProfile(data);
        return;
      }

      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (roleError) {
        console.error('Error fetching roles for missing profile:', roleError);
        return;
      }

      const isSuperAdmin = roleData?.some(r => r.role === 'super_admin');

      if (isSuperAdmin) {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
          console.error('Error fetching auth user for profile creation:', userError);
          return;
        }

        const authUser = userData.user;
        const nome =
          (authUser.user_metadata as { nome?: string } | null | undefined)?.nome ||
          authUser.email ||
          'Administrador';

        const { data: createdProfile, error: createError } = await supabase
          .from('profiles')
          .insert({
            user_id: userId,
            nome,
            ativo: true,
          })
          .select('*, camara:camaras(*)')
          .single();

        if (createError) {
          console.error('Error auto-creating profile for super admin:', createError);
          return;
        }

        setProfile(createdProfile as Profile);
        return;
      }

      console.warn('User has no profile and is not super admin. Signing out to prevent loop.');
      await supabase.auth.signOut();
      setProfile(null);
      setVereador(null);
      setRoles([]);
      setUser(null);
      setSession(null);
    } catch (err) {
      console.error('Unexpected error fetching profile:', err);
    }
  }, []);

  const fetchVereador = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('vereadores')
        .select('id, cargo_mesa')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data) {
        setVereador(data);
      } else {
        setVereador(null);
      }
    } catch (err) {
      console.error('Error fetching vereador:', err);
    }
  }, []);

  const fetchRoles = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    
    if (!error && data) {
      setRoles(data);
    }
  }, []);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer profile fetch to avoid deadlock
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id).catch(console.error);
            fetchRoles(session.user.id).catch(console.error);
            fetchVereador(session.user.id).catch(console.error);
          }, 0);
        } else {
          setProfile(null);
          setVereador(null);
          setRoles([]);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchProfile(session.user.id)
          .catch(e => console.error(e))
          .finally(() => {
            const p1 = fetchRoles(session.user.id).catch(e => console.error(e));
            const p2 = fetchVereador(session.user.id).catch(e => console.error(e));
            Promise.all([p1, p2]).finally(() => setLoading(false));
          });
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile, fetchRoles, fetchVereador]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) return { error };

    const userId = data.user?.id;
    if (!userId) {
      return { error: new Error('Falha ao autenticar. Tente novamente.') };
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    const isSuperAdmin = roleData?.some(r => r.role === 'super_admin');
    if (isSuperAdmin) return { error: null };

    const { data: statusData, error: statusError } = await supabase
      .from('profiles')
      .select(`
        ativo,
        camara:camaras (
          ativo
        )
      `)
      .eq('user_id', userId)
      .maybeSingle();

    if (statusError) return { error: statusError };

    if (!statusData) {
      await supabase.auth.signOut();
      const err = new Error('Seu usuário não possui um perfil válido. Entre em contato com o administrador.') as Error & { code: string };
      err.code = 'PROFILE_MISSING';
      return { error: err };
    }

    const camaraData = statusData.camara as unknown as { ativo: boolean } | null;

    if (statusData.ativo === false) {
      await supabase.auth.signOut();
      const err = new Error('Seu acesso está desativado. Entre em contato com o administrador da câmara.') as Error & { code: string };
      err.code = 'PROFILE_INACTIVE';
      return { error: err };
    }

    if (camaraData && camaraData.ativo === false) {
      await supabase.auth.signOut();
      const err = new Error('A câmara vinculada ao seu usuário está desativada. Entre em contato com o administrador da câmara.') as Error & { code: string };
      err.code = 'CAMARA_INACTIVE';
      return { error: err };
    }

    return { error: null };
  };

  const signUp = async (email: string, password: string, nome: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { nome }
      }
    });
    return { error };
  };

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Erro ao fazer logout:', error);
      }
    } catch (e) {
      console.error('Exceção ao fazer logout:', e);
    } finally {
      setProfile(null);
      setVereador(null);
      setRoles([]);
      setUser(null);
      setSession(null);
      localStorage.removeItem('sessionsync:lastActivityAt');
      localStorage.setItem('sessionsync:justLoggedOut', 'true');
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutos de inatividade
    const STORAGE_KEY = 'sessionsync:lastActivityAt';

    const readLastActivity = () => {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? Number(raw) : NaN;
      return Number.isFinite(parsed) ? parsed : Date.now();
    };

    const writeLastActivity = (ts: number) => {
      try {
        localStorage.setItem(STORAGE_KEY, String(ts));
      } catch {
        void 0;
      }
    };

    const schedule = () => {
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      const last = readLastActivity();
      const now = Date.now();
      const remaining = IDLE_TIMEOUT_MS - (now - last);

      if (remaining <= 0) {
        if (!idleSigningOutRef.current) {
          idleSigningOutRef.current = true;
          toast.info('Sessão encerrada por inatividade.');
          signOut().finally(() => {
            idleSigningOutRef.current = false;
          });
        }
        return;
      }

      idleTimeoutRef.current = setTimeout(() => {
        schedule();
      }, remaining);
    };

    const markActivity = () => {
      const ts = Date.now();
      writeLastActivity(ts);
      schedule();
    };

    markActivity();

    const activityEvents: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'pointerdown',
    ];

    const activityListener: EventListener = () => markActivity();
    for (const evt of activityEvents) {
      window.addEventListener(evt, activityListener, { passive: true });
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) schedule();
    };
    window.addEventListener('storage', onStorage);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') schedule();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const onFocus = () => schedule();
    window.addEventListener('focus', onFocus);

    return () => {
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      for (const evt of activityEvents) {
        window.removeEventListener(evt, activityListener);
      }
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, [user, signOut]);

  const hasRole = (role: Enums<'app_role'>) => {
    return roles.some(r => r.role === role);
  };

  useEffect(() => {
    const checkStatus = async () => {
      if (!user) return;
      
      // Check if user is super admin
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      const isSuperAdmin = roleData?.some(r => r.role === 'super_admin');

      if (isSuperAdmin) return; // Super admin is always active

      // Check profile active status and camara active status
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select(`
          ativo,
          camara:camaras (
            ativo
          )
        `)
        .eq('user_id', user.id)
        .maybeSingle(); // Use maybeSingle instead of single to avoid errors if no profile exists

      if (error) {
        console.error("Error checking account status:", error);
        return;
      }

      if (profileData) {
        const isUserActive = profileData.ativo;
        // Tipagem correta para o join
        const camaraData = profileData.camara as unknown as { ativo: boolean } | null;
        // If camaraData is null, it means user has no camara assigned, so we assume active (or at least valid)
        const isCamaraActive = camaraData ? camaraData.ativo : true;

        if (!isUserActive || !isCamaraActive) {
          await signOut();
        }
      }
    };

    checkStatus();

    if (!user) return;

    // Listen to profile changes for this user
    const profileChannel = supabase
      .channel(`public:profiles:${user.id}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'profiles', 
        filter: `user_id=eq.${user.id}` 
      }, (payload) => {
        if ((payload.new as Profile).ativo === false) {
           signOut();
        }
      })
      .subscribe();

    // Listen to camara changes if user has one
    let camaraChannel: ReturnType<typeof supabase.channel> | null = null;
    
    if (profile?.camara_id) {
      camaraChannel = supabase
        .channel(`public:camaras:${profile.camara_id}`)
        .on('postgres_changes', { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'camaras', 
          filter: `id=eq.${profile.camara_id}` 
        }, (payload) => {
          const newCamara = payload.new as { ativo: boolean };
          if (newCamara.ativo === false) {
            signOut();
          }
        })
        .subscribe();
    }
    
    return () => {
      supabase.removeChannel(profileChannel);
      if (camaraChannel) supabase.removeChannel(camaraChannel);
    };
  }, [user, profile, signOut]);

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      vereador,
      roles,
      loading,
      signIn,
      signUp,
      signOut,
      hasRole,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
