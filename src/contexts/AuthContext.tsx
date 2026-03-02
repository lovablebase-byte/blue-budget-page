import React, { createContext, useContext, useEffect, useState } from 'react';
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
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isReadOnly: boolean;
  forcePasswordChange: boolean;
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
  const [forcePasswordChange, setForcePasswordChange] = useState(false);

  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'admin';

  const fetchUserData = async (userId: string) => {
    try {
      // Fetch user role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', userId)
        .limit(1)
        .single();

      if (roleData) {
        setRole(roleData.role as AppRole);
        setUserRole(roleData as UserRoleData);

        // Check force password change
        const { data: profileData } = await supabase
          .from('profiles')
          .select('force_password_change')
          .eq('user_id', userId)
          .single();
        setForcePasswordChange(profileData?.force_password_change ?? false);

        // Fetch company if not super_admin
        if (roleData.company_id) {
          const { data: companyData } = await supabase
            .from('companies')
            .select('*')
            .eq('id', roleData.company_id)
            .single();
          
          if (companyData) {
            setCompany(companyData as CompanyData);
          }

          // Check subscription status for read-only mode
          const { data: subData } = await supabase
            .from('subscriptions')
            .select('status')
            .eq('company_id', roleData.company_id)
            .single();
          
          if (subData && (subData.status === 'past_due' || subData.status === 'canceled')) {
            setIsReadOnly(true);
          }
        }

        // Fetch permissions for non-super_admin users
        if (roleData.role !== 'super_admin') {
          const { data: permsData } = await supabase
            .from('permissions')
            .select('*, modules(name)')
            .eq('user_role_id', roleData.id);

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
      }
    } catch (err) {
      console.error('Error fetching user data:', err);
    }
  };

  const refreshAuth = async () => {
    if (user) {
      await fetchUserData(user.id);
    }
  };

  const hasPermission = (module: string, action: 'view' | 'create' | 'edit' | 'delete'): boolean => {
    if (isSuperAdmin) return true;
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
    setForcePasswordChange(false);
  };

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!isMounted) return;
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // IMPORTANT: await fetchUserData before setting loading to false
          await fetchUserData(session.user.id);
        } else {
          setRole(null);
          setUserRole(null);
          setCompany(null);
          setPermissions([]);
          setForcePasswordChange(false);
        }
        if (isMounted) setLoading(false);
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!isMounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchUserData(session.user.id);
      }
      if (isMounted) setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user, session, loading, role, userRole, company,
        permissions, isSuperAdmin, isAdmin, isReadOnly, forcePasswordChange,
        hasPermission, signOut, refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
