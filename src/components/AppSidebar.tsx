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
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground glow-primary-sm">
            <MessageCircle className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">WA Manager</span>
              <span className="text-xs text-primary/70">{company?.name || 'Sistema'}</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarSeparator className="border-border/40" />

      <SidebarContent>
        {/* Operational */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-primary/60 uppercase tracking-wider text-[10px] font-bold">Operacional</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleOperational.map((item) => {
                const locked = isFeatureLocked(item.module);
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
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <NavLink
                        to={item.url}
                        end
                        className="hover:bg-primary/10 hover:text-primary transition-colors"
                        activeClassName="bg-primary/20 text-primary font-semibold border-l-[3px] border-primary shadow-[inset_0_0_12px_-4px_hsl(145_69%_49%/0.2)]"
                      >
                        <item.icon className={`h-4 w-4 ${isActive(item.url) ? 'text-primary drop-shadow-[0_0_4px_hsl(145_69%_49%/0.5)]' : 'text-sidebar-foreground'}`} />
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
        <SidebarSeparator className="border-border/40" />
        <SidebarGroup>
          <SidebarGroupLabel className="text-primary/60 uppercase tracking-wider text-[10px] font-bold">Comercial</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {commercialItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink
                      to={item.url}
                      end
                      className="hover:bg-primary/10 hover:text-primary transition-colors"
                      activeClassName="bg-primary/20 text-primary font-semibold border-l-[3px] border-primary shadow-[inset_0_0_12px_-4px_hsl(145_69%_49%/0.2)]"
                    >
                      <item.icon className={`h-4 w-4 ${isActive(item.url) ? 'text-primary drop-shadow-[0_0_4px_hsl(145_69%_49%/0.5)]' : 'text-sidebar-foreground'}`} />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin (company owner) */}
        {isAdmin && (
          <>
            <SidebarSeparator className="border-border/40" />
            <SidebarGroup>
              <SidebarGroupLabel className="text-primary/60 uppercase tracking-wider text-[10px] font-bold">Empresa</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {adminItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={isActive(item.url)}>
                        <NavLink
                          to={item.url}
                          end
                          className="hover:bg-primary/10 hover:text-primary transition-colors"
                          activeClassName="bg-primary/20 text-primary font-semibold border-l-[3px] border-primary shadow-[inset_0_0_12px_-4px_hsl(145_69%_49%/0.2)]"
                        >
                          <item.icon className={`h-4 w-4 ${isActive(item.url) ? 'text-primary drop-shadow-[0_0_4px_hsl(145_69%_49%/0.5)]' : 'text-sidebar-foreground'}`} />
                          {!collapsed && <span>{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        {/* System Admin */}
        {isAdmin && (
          <>
            <SidebarSeparator className="border-border/40" />
            <Collapsible defaultOpen={location.pathname.startsWith('/admin')}>
              <SidebarGroup>
                <CollapsibleTrigger className="flex w-full items-center justify-between px-2 py-1.5 text-[10px] font-bold text-primary/60 uppercase tracking-wider hover:text-primary transition-colors">
                  Admin do Sistema
                  {!collapsed && <ChevronDown className="h-3 w-3" />}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {systemAdminItems.map((item) => (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton asChild isActive={isActive(item.url)}>
                            <NavLink
                              to={item.url}
                              end
                              className="hover:bg-primary/10 hover:text-primary transition-colors"
                              activeClassName="bg-primary/20 text-primary font-semibold border-l-[3px] border-primary shadow-[inset_0_0_12px_-4px_hsl(145_69%_49%/0.2)]"
                            >
                              <item.icon className={`h-4 w-4 ${isActive(item.url) ? 'text-primary drop-shadow-[0_0_4px_hsl(145_69%_49%/0.5)]' : 'text-sidebar-foreground'}`} />
                              {!collapsed && <span>{item.title}</span>}
                            </NavLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          </>
        )}

        {/* Personal */}
        <SidebarSeparator className="border-border/40" />
        <SidebarGroup>
          <SidebarGroupLabel className="text-primary/60 uppercase tracking-wider text-[10px] font-bold">Pessoal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {role === 'user' && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive('/profile')}>
                    <NavLink
                      to="/profile"
                      end
                      className="hover:bg-primary/10 hover:text-primary transition-colors"
                      activeClassName="bg-primary/20 text-primary font-semibold border-l-[3px] border-primary shadow-[inset_0_0_12px_-4px_hsl(145_69%_49%/0.2)]"
                    >
                      <Settings className={`h-4 w-4 ${isActive('/profile') ? 'text-primary drop-shadow-[0_0_4px_hsl(145_69%_49%/0.5)]' : 'text-sidebar-foreground'}`} />
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
                    className="hover:bg-primary/10 hover:text-primary transition-colors"
                    activeClassName="bg-primary/20 text-primary font-semibold border-l-[3px] border-primary shadow-[inset_0_0_12px_-4px_hsl(145_69%_49%/0.2)]"
                  >
                    <User className={`h-4 w-4 ${isActive('/account') ? 'text-primary drop-shadow-[0_0_4px_hsl(145_69%_49%/0.5)]' : 'text-sidebar-foreground'}`} />
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
