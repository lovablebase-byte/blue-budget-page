import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { Breadcrumb } from '@/components/Breadcrumb';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { isReadOnly } = useAuth();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.06),transparent_22%),radial-gradient(circle_at_top,hsl(var(--glow)/0.05),transparent_28%)]">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-border/50 px-4 bg-background/80 backdrop-blur-sm shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <SidebarTrigger className="text-muted-foreground hover:text-primary transition-colors" />
              <Breadcrumb />
            </div>
            <div className="flex items-center gap-2">
              {isReadOnly && (
                <Badge variant="outline" className="border-warning text-warning gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Somente leitura
                </Badge>
              )}
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
