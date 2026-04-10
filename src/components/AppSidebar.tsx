import { 
  LayoutDashboard, Smartphone, MessageCircle, Clock, 
  Radio, Key, GitBranch, Bot, Megaphone, Settings,
  Building2, CreditCard, Receipt, Users, Shield, User,
  Globe, BarChart3, Heart, Webhook, LogOut, ChevronDown, MessageSquare, Palette, FileText, Lock
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
import type { PlanFeatures } from '@/services/plan-enforcement';

/** Map module names to plan feature flags for enforcement */
const moduleFeatureMap: Record<string, keyof PlanFeatures> = {
  campaigns: 'campaigns_enabled',
  workflow: 'workflows_enabled',
  ai_agents: 'ai_agents_enabled',
};

const operationalItems = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { title: 'Instâncias', url: '/instances', icon: Smartphone, module: 'instances' },
  { title: 'Saudações', url: '/greetings', icon: MessageCircle, module: 'greetings' },
  { title: 'Ausência', url: '/absence', icon: Clock, module: 'absence' },
  { title: 'Status', url: '/status', icon: Radio, module: 'status' },
  { title: 'Chatbots Keys', url: '/chatbot-keys', icon: Key, module: 'chatbot_keys' },
  { title: 'Workflow', url: '/workflow', icon: GitBranch, module: 'workflow' },
  { title: 'Chatbot Keywords', url: '/chatbot-keywords', icon: MessageSquare, module: 'chatbot_keys' },
  { title: 'Agentes IA', url: '/ai-agents', icon: Bot, module: 'ai_agents' },
  { title: 'Campanhas', url: '/campaigns', icon: Megaphone, module: 'campaigns' },
];

const commercialItems = [
  { title: 'Plano e Assinatura', url: '/subscription', icon: CreditCard },
  { title: 'Faturas', url: '/invoices', icon: Receipt },
];

const adminItems = [
  { title: 'Usuários', url: '/users', icon: Users },
  { title: 'Ajustes', url: '/settings', icon: Settings, module: 'settings' },
  { title: 'Marca', url: '/branding', icon: Palette },
];

const systemAdminItems = [
  { title: 'Empresas', url: '/admin/companies', icon: Building2 },
  { title: 'Assinaturas', url: '/admin/subscriptions', icon: CreditCard },
  { title: 'Instâncias Globais', url: '/admin/instances', icon: Smartphone },
  { title: 'Saudações Globais', url: '/admin/greetings', icon: MessageCircle },
  { title: 'Ausência Global', url: '/admin/absence', icon: Clock },
  { title: 'Status Global', url: '/admin/status', icon: Radio },
  { title: 'Chatbot Keys Global', url: '/admin/chatbot-keys', icon: Key },
  { title: 'Workflows Globais', url: '/admin/workflows', icon: GitBranch },
  { title: 'Keywords Globais', url: '/admin/chatbot-keywords', icon: MessageSquare },
  { title: 'Agentes IA Globais', url: '/admin/ai-agents', icon: Bot },
  { title: 'Campanhas Globais', url: '/admin/campaigns', icon: Megaphone },
  { title: 'Planos Globais', url: '/admin/plans', icon: CreditCard },
  { title: 'Usuários Globais', url: '/admin/users', icon: Shield },
  { title: 'Faturas Globais', url: '/admin/invoices', icon: Receipt },
  { title: 'Gateways', url: '/admin/gateways', icon: Globe },
  { title: 'Ajustes Globais', url: '/admin/settings', icon: Settings },
  { title: 'Marca Global', url: '/admin/branding', icon: Palette },
  { title: 'Relatórios', url: '/admin/reports', icon: BarChart3 },
  { title: 'Saúde do Sistema', url: '/admin/health', icon: Heart },
  { title: 'Webhooks', url: '/admin/webhooks', icon: Webhook },
  { title: 'Logs de Mensagens', url: '/admin/logs', icon: FileText },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const navigate = useNavigate();
  const { role, isAdmin, hasPermission, signOut, company, user } = useAuth();
  const { hasFeature, plan } = useCompany();

  const isActive = (path: string) => location.pathname === path;

  /** Check if a module's feature is locked by the plan */
  const isFeatureLocked = (module: string): boolean => {
    if (isAdmin) return false;
    const featureKey = moduleFeatureMap[module];
    if (!featureKey) return false;
    if (!plan) return false;
    return !hasFeature(featureKey);
  };

  const visibleOperational = operationalItems.filter(item => {
    if (isAdmin) return true;
    return hasPermission(item.module, 'view');
  });

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
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
              <span className="text-[11px] text-primary/80 font-medium">{company?.name || 'Sistema'}</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarSeparator className="border-border/30" />

      <SidebarContent>
        {/* Operational */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-accent/70 uppercase tracking-widest text-[10px] font-bold">Operacional</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleOperational.map((item) => {
                const locked = isFeatureLocked(item.module);
                const active = isActive(item.url);
                if (locked) {
                  return (
                    <SidebarMenuItem key={item.title}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton className="opacity-40 cursor-not-allowed">
                            <item.icon className="h-4 w-4" />
                            {!collapsed && <span>{item.title}</span>}
                            {!collapsed && <Lock className="h-3 w-3 ml-auto text-muted-foreground" />}
                          </SidebarMenuButton>
                        </TooltipTrigger>
                        <TooltipContent side="right">Recurso bloqueado pelo plano</TooltipContent>
                      </Tooltip>
                    </SidebarMenuItem>
                  );
                }
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={active}>
                      <NavLink
                        to={item.url}
                        end
                        className="hover:bg-primary/10 hover:text-foreground transition-all duration-150"
                        activeClassName="bg-primary/15 text-primary font-semibold border-l-[3px] border-[hsl(var(--glow))] shadow-[inset_0_0_20px_-6px_hsl(var(--primary)/0.25)]"
                      >
                        <item.icon className={`h-4 w-4 transition-all ${active ? 'text-[hsl(var(--glow))] drop-shadow-[0_0_6px_hsl(var(--glow)/0.6)]' : 'text-sidebar-foreground/80'}`} />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Comercial */}
        <SidebarSeparator className="border-border/30" />
        <SidebarGroup>
          <SidebarGroupLabel className="text-accent/70 uppercase tracking-widest text-[10px] font-bold">Comercial</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {commercialItems.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={active}>
                      <NavLink
                        to={item.url}
                        end
                        className="hover:bg-primary/10 hover:text-foreground transition-all duration-150"
                        activeClassName="bg-primary/15 text-primary font-semibold border-l-[3px] border-[hsl(var(--glow))] shadow-[inset_0_0_20px_-6px_hsl(var(--primary)/0.25)]"
                      >
                        <item.icon className={`h-4 w-4 transition-all ${active ? 'text-[hsl(var(--glow))] drop-shadow-[0_0_6px_hsl(var(--glow)/0.6)]' : 'text-sidebar-foreground/80'}`} />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin (company owner) */}
        {isAdmin && (
          <>
            <SidebarSeparator className="border-border/30" />
            <SidebarGroup>
              <SidebarGroupLabel className="text-accent/70 uppercase tracking-widest text-[10px] font-bold">Empresa</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {adminItems.map((item) => {
                    const active = isActive(item.url);
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild isActive={active}>
                          <NavLink
                            to={item.url}
                            end
                            className="hover:bg-primary/10 hover:text-foreground transition-all duration-150"
                            activeClassName="bg-primary/15 text-primary font-semibold border-l-[3px] border-[hsl(var(--glow))] shadow-[inset_0_0_20px_-6px_hsl(var(--primary)/0.25)]"
                          >
                            <item.icon className={`h-4 w-4 transition-all ${active ? 'text-[hsl(var(--glow))] drop-shadow-[0_0_6px_hsl(var(--glow)/0.6)]' : 'text-sidebar-foreground/80'}`} />
                            {!collapsed && <span>{item.title}</span>}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        {/* System Admin */}
        {isAdmin && (
          <>
            <SidebarSeparator className="border-border/30" />
            <Collapsible defaultOpen={location.pathname.startsWith('/admin')}>
              <SidebarGroup>
                <CollapsibleTrigger className="flex w-full items-center justify-between px-2 py-1.5 text-[10px] font-bold text-accent/70 uppercase tracking-widest hover:text-accent transition-colors">
                  Admin do Sistema
                  {!collapsed && <ChevronDown className="h-3 w-3" />}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {systemAdminItems.map((item) => {
                        const active = isActive(item.url);
                        return (
                          <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton asChild isActive={active}>
                              <NavLink
                                to={item.url}
                                end
                                className="hover:bg-primary/10 hover:text-foreground transition-all duration-150"
                                activeClassName="bg-primary/15 text-primary font-semibold border-l-[3px] border-[hsl(var(--glow))] shadow-[inset_0_0_20px_-6px_hsl(var(--primary)/0.25)]"
                              >
                                <item.icon className={`h-4 w-4 transition-all ${active ? 'text-[hsl(var(--glow))] drop-shadow-[0_0_6px_hsl(var(--glow)/0.6)]' : 'text-sidebar-foreground/80'}`} />
                                {!collapsed && <span>{item.title}</span>}
                              </NavLink>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          </>
        )}

        {/* Personal */}
        <SidebarSeparator className="border-border/30" />
        <SidebarGroup>
          <SidebarGroupLabel className="text-accent/70 uppercase tracking-widest text-[10px] font-bold">Pessoal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {role === 'user' && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive('/profile')}>
                    <NavLink
                      to="/profile"
                      end
                      className="hover:bg-primary/10 hover:text-foreground transition-all duration-150"
                      activeClassName="bg-primary/15 text-primary font-semibold border-l-[3px] border-[hsl(var(--glow))] shadow-[inset_0_0_20px_-6px_hsl(var(--primary)/0.25)]"
                    >
                      <Settings className={`h-4 w-4 transition-all ${isActive('/profile') ? 'text-[hsl(var(--glow))] drop-shadow-[0_0_6px_hsl(var(--glow)/0.6)]' : 'text-sidebar-foreground/80'}`} />
                      {!collapsed && <span>Meu Perfil</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive('/account')}>
                  <NavLink
                    to="/account"
                    end
                    className="hover:bg-primary/10 hover:text-foreground transition-all duration-150"
                    activeClassName="bg-primary/15 text-primary font-semibold border-l-[3px] border-[hsl(var(--glow))] shadow-[inset_0_0_20px_-6px_hsl(var(--primary)/0.25)]"
                  >
                    <User className={`h-4 w-4 transition-all ${isActive('/account') ? 'text-[hsl(var(--glow))] drop-shadow-[0_0_6px_hsl(var(--glow)/0.6)]' : 'text-sidebar-foreground/80'}`} />
                    {!collapsed && <span>Minha Conta</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
