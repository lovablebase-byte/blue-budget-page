import { 
  MessageCircle, LogOut, ChevronDown, Lock
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, SidebarSeparator, useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { moduleFeatureMap } from '@/lib/routes';
import {
  operationalRoutes, adminRoutes, personalRoutes, type RouteDefinition,
} from '@/lib/routes';

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const navigate = useNavigate();
  const { role, isAdmin, hasPermission, permissions, signOut, company, user } = useAuth();
  const { hasFeature, plan, planLoading } = useCompany();

  const isActive = (path: string) => location.pathname === path;

  const isFeatureLocked = (module?: string): boolean => {
    if (!module) return false;
    if (isAdmin) return false;
    const featureKey = moduleFeatureMap[module];
    if (!featureKey) return false;
    // No plan loaded yet or no subscription → locked
    if (!plan) return true;
    return !hasFeature(featureKey);
  };

  /**
   * Visibility logic for operational menu items:
   * 1. Admin → always visible
   * 2. No module → always visible (e.g. dashboard)
   * 3. Plan still loading → show skeleton / show all (handled by planLoading)
   * 4. Plan feature flag exists and is DISABLED (or no plan) → hide entirely
   * 5. If user has granular permissions configured → respect hasPermission
   * 6. If user has NO granular permissions → show (plan feature controls access)
   */
  const visibleOperational = operationalRoutes.filter(item => {
    if (isAdmin) return true;
    if (!item.module) return true;
    // While plan is loading, show all items to avoid flicker
    if (planLoading) return true;

    // Check plan feature — if plan disables it OR no plan exists, hide from menu
    const featureKey = moduleFeatureMap[item.module];
    if (featureKey) {
      if (!plan || !hasFeature(featureKey)) return false;
    }

    // If user has a specific granular permission for THIS module, respect it
    const modulePerm = permissions.find(p => p.module === item.module);
    if (modulePerm) return modulePerm.can_view;

    // No specific permission for this module → plan feature is enough to show
    return true;
  });

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const renderMenuItem = (item: RouteDefinition) => {
    const locked = isFeatureLocked(item.module);
    const active = isActive(item.path);
    const Icon = item.icon!;

    if (locked) {
      return (
        <SidebarMenuItem key={item.path}>
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarMenuButton className="opacity-40 cursor-not-allowed">
                <Icon className="h-4 w-4" />
                {!collapsed && <span>{item.label}</span>}
                {!collapsed && <Lock className="h-3 w-3 ml-auto text-muted-foreground" />}
              </SidebarMenuButton>
            </TooltipTrigger>
            <TooltipContent side="right">Recurso bloqueado pelo plano</TooltipContent>
          </Tooltip>
        </SidebarMenuItem>
      );
    }

    return (
      <SidebarMenuItem key={item.path}>
        <SidebarMenuButton asChild isActive={active}>
          <NavLink
            to={item.path}
            end
            className="hover:bg-primary/10 hover:text-foreground transition-all duration-150"
            activeClassName="bg-primary/15 text-primary font-semibold border-l-[3px] border-[hsl(var(--glow))] shadow-[inset_0_0_20px_-6px_hsl(var(--primary)/0.25)]"
          >
            <Icon className={`h-4 w-4 transition-all ${active ? 'text-[hsl(var(--glow))] drop-shadow-[0_0_6px_hsl(var(--glow)/0.6)]' : 'text-sidebar-foreground/80'}`} />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r-border/30">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-dark shadow-[0_0_16px_-3px_hsl(var(--primary)/0.5)]">
            <MessageCircle className="h-4 w-4 text-primary-foreground drop-shadow-[0_0_4px_hsl(var(--glow)/0.6)]" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold text-foreground tracking-tight">WA Manager</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarSeparator className="border-border/30" />

      <SidebarContent>
        {/* Operacional */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-accent/70 uppercase tracking-widest text-[10px] font-bold">Operacional</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleOperational.map(renderMenuItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Administração (admin only) */}
        {isAdmin && (
          <>
            <SidebarSeparator className="border-border/30" />
            <Collapsible defaultOpen={
              location.pathname.startsWith('/admin') ||
              ['/users', '/settings', '/branding'].includes(location.pathname)
            }>
              <SidebarGroup>
                <CollapsibleTrigger className="flex w-full items-center justify-between px-2 py-1.5 text-[10px] font-bold text-accent/70 uppercase tracking-widest hover:text-accent transition-colors">
                  Administração
                  {!collapsed && <ChevronDown className="h-3 w-3" />}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {adminRoutes.map(renderMenuItem)}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          </>
        )}

        {/* Pessoal */}
        <SidebarSeparator className="border-border/30" />
        <SidebarGroup>
          <SidebarGroupLabel className="text-accent/70 uppercase tracking-widest text-[10px] font-bold">Pessoal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {personalRoutes.map(renderMenuItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-2 py-2">
          {!collapsed && (
            <p className="mb-2 truncate text-xs text-muted-foreground">
              {user?.email}
            </p>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && <span className="ml-2">Sair</span>}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
