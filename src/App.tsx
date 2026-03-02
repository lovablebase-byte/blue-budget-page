import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import AccessDenied from "./pages/AccessDenied";
import Dashboard from "./pages/Dashboard";
import Placeholder from "./pages/Placeholder";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedPage({ children, module, role }: { children: React.ReactNode; module?: string; role?: ('super_admin' | 'admin' | 'user')[] }) {
  return (
    <ProtectedRoute requiredModule={module} requiredRole={role}>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/access-denied" element={<AccessDenied />} />
            
            {/* Operational routes */}
            <Route path="/dashboard" element={<ProtectedPage module="dashboard"><Dashboard /></ProtectedPage>} />
            <Route path="/instances" element={<ProtectedPage module="instances"><Placeholder /></ProtectedPage>} />
            <Route path="/greetings" element={<ProtectedPage module="greetings"><Placeholder /></ProtectedPage>} />
            <Route path="/absence" element={<ProtectedPage module="absence"><Placeholder /></ProtectedPage>} />
            <Route path="/status" element={<ProtectedPage module="status"><Placeholder /></ProtectedPage>} />
            <Route path="/chatbot-keys" element={<ProtectedPage module="chatbot_keys"><Placeholder /></ProtectedPage>} />
            <Route path="/workflow" element={<ProtectedPage module="workflow"><Placeholder /></ProtectedPage>} />
            <Route path="/ai-agents" element={<ProtectedPage module="ai_agents"><Placeholder /></ProtectedPage>} />
            <Route path="/campaigns" element={<ProtectedPage module="campaigns"><Placeholder /></ProtectedPage>} />

            {/* Admin routes */}
            <Route path="/subscription" element={<ProtectedPage role={['admin', 'super_admin']}><Placeholder /></ProtectedPage>} />
            <Route path="/invoices" element={<ProtectedPage role={['admin', 'super_admin']}><Placeholder /></ProtectedPage>} />
            <Route path="/users" element={<ProtectedPage role={['admin', 'super_admin']}><Placeholder /></ProtectedPage>} />
            <Route path="/settings" element={<ProtectedPage module="settings"><Placeholder /></ProtectedPage>} />
            <Route path="/profile" element={<ProtectedPage><Placeholder /></ProtectedPage>} />

            {/* Super Admin routes */}
            <Route path="/admin/companies" element={<ProtectedPage role={['super_admin']}><Placeholder /></ProtectedPage>} />
            <Route path="/admin/plans" element={<ProtectedPage role={['super_admin']}><Placeholder /></ProtectedPage>} />
            <Route path="/admin/users" element={<ProtectedPage role={['super_admin']}><Placeholder /></ProtectedPage>} />
            <Route path="/admin/invoices" element={<ProtectedPage role={['super_admin']}><Placeholder /></ProtectedPage>} />
            <Route path="/admin/gateways" element={<ProtectedPage role={['super_admin']}><Placeholder /></ProtectedPage>} />
            <Route path="/admin/reports" element={<ProtectedPage role={['super_admin']}><Placeholder /></ProtectedPage>} />
            <Route path="/admin/health" element={<ProtectedPage role={['super_admin']}><Placeholder /></ProtectedPage>} />
            <Route path="/admin/webhooks" element={<ProtectedPage role={['super_admin']}><Placeholder /></ProtectedPage>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
