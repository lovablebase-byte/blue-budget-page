import { useLocation, Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

const routeLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  instances: 'Instâncias',
  greetings: 'Saudações',
  absence: 'Ausência',
  status: 'Status',
  'chatbot-keys': 'Chatbots Keys',
  workflow: 'Workflow',
  'ai-agents': 'Agentes IA',
  campaigns: 'Campanhas',
  subscription: 'Assinatura',
  invoices: 'Faturas',
  users: 'Usuários',
  settings: 'Ajustes',
  profile: 'Meu Perfil',
  account: 'Minha Conta',
  admin: 'Admin',
  companies: 'Empresas',
  plans: 'Planos',
  gateways: 'Gateways',
  reports: 'Relatórios',
  health: 'Saúde',
  webhooks: 'Webhooks',
  'reset-password': 'Redefinir Senha',
};

export function Breadcrumb() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground">
      <Link to="/dashboard" className="hover:text-foreground transition-colors">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {segments.map((segment, index) => {
        const path = '/' + segments.slice(0, index + 1).join('/');
        const isLast = index === segments.length - 1;
        const label = routeLabels[segment] || segment;

        return (
          <span key={path} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            {isLast ? (
              <span className="font-medium text-foreground">{label}</span>
            ) : (
              <Link to={path} className="hover:text-foreground transition-colors">
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
