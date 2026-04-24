import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { routeOrderForRedirect } from '@/lib/routes';
import { Button } from '@/components/ui/button';
import { MessageCircle, ArrowRight, Smartphone, Bot, Megaphone, Shield } from 'lucide-react';

const Index = () => {
  const { user, loading, role, roleError } = useAuth();

  if (loading) return null;

  // Authenticated users → redirect by role
  if (user) {
    // Erro de role: deixa ProtectedRoute lidar via /account (que mostrará a tela de bloqueio)
    if (roleError) return <Navigate to="/account" replace />;
    // Admin SEMPRE vai para o painel admin
    if (role === 'admin') return <Navigate to="/dashboard" replace />;
    // Usuário comum vai para a primeira área operacional disponível.
    // Se nenhuma estiver disponível, vai para /account (área pessoal).
    if (role === 'user') return <Navigate to="/instances" replace />;
    // role === null sem erro (transição): aguarda
    return null;
  }

  // Public landing page
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-dark shadow-[0_0_16px_-3px_hsl(var(--primary)/0.5)]">
              <MessageCircle className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight">WA Manager</span>
          </div>
          <Link to="/auth">
            <Button size="sm">Entrar</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-3xl text-center space-y-8">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Gerencie seu WhatsApp
            <span className="text-primary"> de forma inteligente</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Plataforma completa para gerenciamento de instâncias, campanhas, agentes de IA e automação de mensagens via WhatsApp.
          </p>
          <div className="flex gap-4 justify-center">
            <Link to="/auth">
              <Button size="lg" className="gap-2">
                Acessar o sistema <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-8">
            {[
              { icon: Smartphone, label: 'Multi-instâncias' },
              { icon: Bot, label: 'Agentes IA' },
              { icon: Megaphone, label: 'Campanhas' },
              { icon: Shield, label: 'Anti-ban' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border/40 bg-card/50">
                <Icon className="h-6 w-6 text-primary" />
                <span className="text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} WA Manager
      </footer>
    </div>
  );
};

export default Index;
