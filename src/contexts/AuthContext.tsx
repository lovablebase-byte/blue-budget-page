import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { AppRole, UserRoleData, CompanyData, ModulePermission } from '@/types/roles';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: AppRole | null;
  userRole: UserRoleData | null;
  company: CompanyData | null;
  permissions: ModulePermission[];
  isAdmin: boolean;
  isReadOnly: boolean;
  hasPermission: (module: string, action: 'view' | 'create' | 'edit' | 'delete') => boolean;
  signOut: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [userRole, setUserRole] = useState<UserRoleData | null>(null);
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [permissions, setPermissions] = useState<ModulePermission[]>([]);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [userDataLoaded, setUserDataLoaded] = useState(false);

  const isMountedRef = useRef(true);

  const isAdmin = role === 'admin';

  const fetchUserData = useCallback(async (userId: string) => {
    try {
      // Fetch user role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', userId)
        .limit(1)
        .single();

      if (!isMountedRef.current) return;

      if (roleData) {
        // Normalize: treat any legacy super_admin as admin
        const normalizedRole = (roleData.role === 'super_admin' ? 'admin' : roleData.role) as AppRole;
        setRole(normalizedRole);
        setUserRole({ ...roleData, role: normalizedRole } as UserRoleData);

        // Fetch company
        if (roleData.company_id) {
          const { data: companyData } = await supabase
            .from('companies')
            .select('*')
            .eq('id', roleData.company_id)
            .single();
          
          if (!isMountedRef.current) return;
          if (companyData) {
            setCompany(companyData as CompanyData);
          }

          // Check subscription status for read-only mode
          const { data: subData } = await supabase
            .from('subscriptions')
            .select('status')
            .eq('company_id', roleData.company_id)
            .single();
          
          if (!isMountedRef.current) return;
          if (subData && (subData.status === 'past_due' || subData.status === 'canceled')) {
            setIsReadOnly(true);
          }
        }

        // Fetch permissions for all users (admin gets bypass via hasPermission)
        const { data: permsData } = await supabase
          .from('permissions')
          .select('*, modules(name)')
          .eq('user_role_id', roleData.id);

        if (!isMountedRef.current) return;
        if (permsData) {
          const mapped: ModulePermission[] = permsData.map((p: any) => ({
            module: p.modules?.name,
            can_view: p.can_view,
            can_create: p.can_create,
            can_edit: p.can_edit,
            can_delete: p.can_delete,
            extra_permissions: p.extra_permissions || {},
          }));
          setPermissions(mapped);
        }
      }
    } catch (err) {
      console.error('Error fetching user data:', err);
    } finally {
      if (isMountedRef.current) {
        setUserDataLoaded(true);
      }
    }
  }, []);

  const refreshAuth = async () => {
    if (user) {
      setUserDataLoaded(false);
      await fetchUserData(user.id);
    }
  };

  const hasPermission = (module: string, action: 'view' | 'create' | 'edit' | 'delete'): boolean => {
    if (isAdmin) return true;
    if (isReadOnly && action !== 'view') return false;

    const perm = permissions.find(p => p.module === module);
    if (!perm) return false;

    switch (action) {
      case 'view': return perm.can_view;
      case 'create': return perm.can_create;
      case 'edit': return perm.can_edit;
      case 'delete': return perm.can_delete;
      default: return false;
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setUserRole(null);
    setCompany(null);
    setPermissions([]);
    setIsReadOnly(false);
    setUserDataLoaded(false);
  };

  // Effect 1: Listen to auth state changes
  useEffect(() => {
    isMountedRef.current = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!isMountedRef.current) return;
        setSession(session);
        setUser(session?.user ?? null);

        if (!session?.user) {
          setRole(null);
          setUserRole(null);
          setCompany(null);
          setPermissions([]);
          setUserDataLoaded(false);
          setLoading(false);
        }
      }
    );

    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMountedRef.current) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (!session?.user) {
        setLoading(false);
      }
    });

    return () => {
      isMountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  // Effect 2: Fetch user data AFTER user is set
  useEffect(() => {
    if (user) {
      setUserDataLoaded(false);
      fetchUserData(user.id);
    }
  }, [user?.id, fetchUserData]);

  // Effect 3: Only set loading=false when user data is loaded
  useEffect(() => {
    if (user && userDataLoaded) {
      setLoading(false);
    }
  }, [user, userDataLoaded]);

  return (
    <AuthContext.Provider
      value={{
        user, session, loading, role, userRole, company,
        permissions, isAdmin, isReadOnly,
        hasPermission, signOut, refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

const defaultAuthContext: AuthContextType = {
  user: null, session: null, loading: true, role: null,
  userRole: null, company: null, permissions: [],
  isAdmin: false, isReadOnly: false,
  hasPermission: () => false,
  signOut: async () => {},
  refreshAuth: async () => {},
};

export function useAuth() {
  const context = useContext(AuthContext);
  return context ?? defaultAuthContext;
}
