/**
 * Fonte única de verdade para rotas ativas do sistema.
 * Menu, router, breadcrumb, redirects e guards consomem esta definição.
 */

import {
  LayoutDashboard, Smartphone, Bot, Megaphone, Settings,
  Building2, CreditCard, Receipt, Users, Shield, User,
  Globe, BarChart3, Heart, Webhook, FileText, Palette,
  type LucideIcon,
} from 'lucide-react';

export interface RouteDefinition {
  path: string;
  label: string;
  icon?: LucideIcon;
  module?: string;
  /** If true, only admins can access */
  adminOnly?: boolean;
}

// ── Operational (company-level) ──────────────────────────────────
export const operationalRoutes: RouteDefinition[] = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { path: '/instances', label: 'Instâncias', icon: Smartphone, module: 'instances' },
  { path: '/ai-agents', label: 'Agentes IA', icon: Bot, module: 'ai_agents' },
  { path: '/campaigns', label: 'Campanhas', icon: Megaphone, module: 'campaigns' },
];

// ── Commercial ───────────────────────────────────────────────────
export const commercialRoutes: RouteDefinition[] = [
  { path: '/subscription', label: 'Plano e Assinatura', icon: CreditCard },
  { path: '/invoices', label: 'Faturas', icon: Receipt },
];

// ── Company admin ────────────────────────────────────────────────
export const companyAdminRoutes: RouteDefinition[] = [
  { path: '/users', label: 'Usuários', icon: Users, adminOnly: true },
  { path: '/settings', label: 'Ajustes', icon: Settings, module: 'settings' },
  { path: '/branding', label: 'Marca', icon: Palette, adminOnly: true },
];

// ── System admin ─────────────────────────────────────────────────
export const systemAdminRoutes: RouteDefinition[] = [
  { path: '/admin/companies', label: 'Empresas', icon: Building2 },
  { path: '/admin/subscriptions', label: 'Assinaturas', icon: CreditCard },
  { path: '/admin/instances', label: 'Instâncias Globais', icon: Smartphone },
  { path: '/admin/ai-agents', label: 'Agentes IA Globais', icon: Bot },
  { path: '/admin/campaigns', label: 'Campanhas Globais', icon: Megaphone },
  { path: '/admin/plans', label: 'Planos Globais', icon: CreditCard },
  { path: '/admin/users', label: 'Usuários Globais', icon: Shield },
  { path: '/admin/invoices', label: 'Faturas Globais', icon: Receipt },
  { path: '/admin/gateways', label: 'Gateways', icon: Globe },
  { path: '/admin/settings', label: 'Ajustes Globais', icon: Settings },
  { path: '/admin/branding', label: 'Marca Global', icon: Palette },
  { path: '/admin/reports', label: 'Relatórios', icon: BarChart3 },
  { path: '/admin/health', label: 'Saúde do Sistema', icon: Heart },
  { path: '/admin/webhooks', label: 'Webhooks', icon: Webhook },
  { path: '/admin/logs', label: 'Logs de Mensagens', icon: FileText },
];

// ── Personal ─────────────────────────────────────────────────────
export const personalRoutes: RouteDefinition[] = [
  { path: '/profile', label: 'Meu Perfil', icon: User },
  { path: '/account', label: 'Minha Conta', icon: User },
];

// ── All active routes (flat) ─────────────────────────────────────
export const allActiveRoutes: RouteDefinition[] = [
  ...operationalRoutes,
  ...commercialRoutes,
  ...companyAdminRoutes,
  ...systemAdminRoutes,
  ...personalRoutes,
];

// ── Breadcrumb labels (derived) ──────────────────────────────────
export const breadcrumbLabels: Record<string, string> = Object.fromEntries(
  allActiveRoutes
    .map(r => {
      const segments = r.path.split('/').filter(Boolean);
      const lastSegment = segments[segments.length - 1];
      return [lastSegment, r.label];
    })
);
// Add known segments not directly in routes
breadcrumbLabels['admin'] = 'Admin';
breadcrumbLabels['reset-password'] = 'Redefinir Senha';

// ── Legacy paths that should redirect to /dashboard ──────────────
export const legacyRedirects: string[] = [
  '/greetings',
  '/absence',
  '/status',
  '/chatbot-keys',
  '/workflow',
  '/chatbot-keywords',
  '/admin/greetings',
  '/admin/absence',
  '/admin/status',
  '/admin/chatbot-keys',
  '/admin/workflows',
  '/admin/chatbot-keywords',
];

// ── Route order for initial redirect (user role) ─────────────────
export const routeOrderForRedirect: { path: string; module: string }[] = [
  { path: '/dashboard', module: 'dashboard' },
  { path: '/instances', module: 'instances' },
  { path: '/ai-agents', module: 'ai_agents' },
  { path: '/campaigns', module: 'campaigns' },
];
