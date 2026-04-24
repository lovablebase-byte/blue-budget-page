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
    console.log('Fetching user data for:', userId);
    try {
      // Fetch user role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (!isMountedRef.current) return;

      if (roleError) {
        console.error('Error fetching user role:', roleError);
        throw roleError;
      }

      let activeRoleData = roleData;

      // Fallback: If no role found, create one automatically (self-healing)
      if (!activeRoleData) {
        console.log('No role found for user, creating default role...');
        
        // Find default company
        const { data: companies } = await supabase
          .from('companies')
          .select('id')
          .limit(1);
        
        const defaultCompanyId = companies && companies.length > 0 ? companies[0].id : null;

        const { data: newRole, error: createError } = await supabase
          .from('user_roles')
          .insert({
            user_id: userId,
            company_id: defaultCompanyId,
            role: 'user'
          })
          .select()
          .single();

        if (createError) {
          console.error('Error creating default role:', createError);
          // If we can't create it, we can't proceed normally, but we shouldn't loop
        } else {
          activeRoleData = newRole;
          console.log('Default role created successfully');
        }
      }

      if (activeRoleData) {
        // Normalize: treat any legacy super_admin as admin
        const normalizedRole = (activeRoleData.role === 'super_admin' ? 'admin' : activeRoleData.role) as AppRole;
        console.log('Setting user role:', normalizedRole);
        setRole(normalizedRole);
        setUserRole({ ...activeRoleData, role: normalizedRole } as UserRoleData);

        // Fetch company
        if (activeRoleData.company_id) {
          const { data: companyData } = await supabase
            .from('companies')
            .select('*')
            .eq('id', activeRoleData.company_id)
            .single();
          
          if (!isMountedRef.current) return;
          if (companyData) {
            console.log('Setting company:', companyData.name);
            setCompany(companyData as CompanyData);
          }

          // Check subscription status for read-only mode
          const { data: subData } = await supabase
            .from('subscriptions')
            .select('status')
            .eq('company_id', activeRoleData.company_id)
            .single();
          
          if (!isMountedRef.current) return;
          if (subData && (subData.status === 'past_due' || subData.status === 'canceled')) {
            setIsReadOnly(true);
          }
        }

        // Fetch permissions
        const { data: permsData } = await supabase
          .from('permissions')
          .select('*, modules(name)')
          .eq('user_role_id', activeRoleData.id);

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
      } else {
        // Safe fallback if still no role
        console.warn('User has no role and creation failed. Setting default user role in state.');
        setRole('user');
      }
    } catch (err) {
      console.error('Error in fetchUserData:', err);
      // Ensure we don't block the UI forever even on critical failure
      if (isMountedRef.current) {
        setRole('user'); 
      }
    } finally {
      if (isMountedRef.current) {
        setUserDataLoaded(true);
        console.log('User data loading finished');
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

    // If the user has NO granular permissions configured at all, fall back to allowing
    // (plan-level features are the gate). This mirrors ProtectedRoute behavior and
    // prevents UI actions from being hidden for clients without explicit RBAC rows.
    if (permissions.length === 0) return true;

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
