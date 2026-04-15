/**
 * Fonte única de verdade para rotas ativas do sistema.
 * Menu, router, breadcrumb, redirects e guards consomem esta definição.
 */

import {
  LayoutDashboard, Smartphone, Bot, Megaphone, Settings,
  CreditCard, Receipt, Users, User, Palette,
  Globe, BarChart3, Heart, FileText, Package,
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

// ── Operational (todos os usuários com permissão) ────────────────
export const operationalRoutes: RouteDefinition[] = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { path: '/instances', label: 'Instâncias', icon: Smartphone, module: 'instances' },
  { path: '/ai-agents', label: 'Agentes IA', icon: Bot, module: 'ai_agents' },
  { path: '/campaigns', label: 'Campanhas', icon: Megaphone, module: 'campaigns' },
];

// ── Administração (admin only) ───────────────────────────────────
export const adminRoutes: RouteDefinition[] = [
  { path: '/users', label: 'Usuários', icon: Users, adminOnly: true },
  { path: '/admin/plans', label: 'Planos', icon: Package, adminOnly: true },
  { path: '/admin/subscriptions', label: 'Assinaturas', icon: CreditCard, adminOnly: true },
  { path: '/admin/reports', label: 'Relatórios', icon: BarChart3, adminOnly: true },
  { path: '/admin/gateways', label: 'Gateways', icon: Globe, adminOnly: true },
  { path: '/admin/logs', label: 'Logs de Mensagens', icon: FileText, adminOnly: true },
  { path: '/branding', label: 'Marca', icon: Palette, adminOnly: true },
  { path: '/settings', label: 'Configurações', icon: Settings, module: 'settings', adminOnly: true },
  { path: '/admin/health', label: 'Saúde do Sistema', icon: Heart, adminOnly: true },
];

// ── Pessoal ──────────────────────────────────────────────────────
export const personalRoutes: RouteDefinition[] = [
  { path: '/account', label: 'Minha Conta', icon: User },
];

// ── All active routes (flat) ─────────────────────────────────────
export const allActiveRoutes: RouteDefinition[] = [
  ...operationalRoutes,
  ...adminRoutes,
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
breadcrumbLabels['admin'] = 'Administração';
breadcrumbLabels['reset-password'] = 'Redefinir Senha';

// ── Legacy paths that should redirect to /dashboard ──────────────
export const legacyRedirects: string[] = [
  '/greetings',
  '/absence',
  '/status',
  '/chatbot-keys',
  '/workflow',
  '/chatbot-keywords',
  '/profile',
  '/invoices',
  '/subscription',
  '/agentes',
  '/agents',
  '/admin/greetings',
  '/admin/absence',
  '/admin/status',
  '/admin/chatbot-keys',
  '/admin/workflows',
  '/admin/chatbot-keywords',
  '/admin/companies',
  '/admin/instances',
  '/admin/ai-agents',
  '/admin/campaigns',
  '/admin/users',
  '/admin/invoices',
  '/admin/settings',
  '/admin/branding',
  '/admin/webhooks',
  '/company-invoices',
];

// ── Route order for initial redirect (user role) ─────────────────
export const routeOrderForRedirect: { path: string; module: string }[] = [
  { path: '/dashboard', module: 'dashboard' },
  { path: '/instances', module: 'instances' },
  { path: '/ai-agents', module: 'ai_agents' },
  { path: '/campaigns', module: 'campaigns' },
];
