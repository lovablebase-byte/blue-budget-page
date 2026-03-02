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
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b px-4 bg-background shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <SidebarTrigger />
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
