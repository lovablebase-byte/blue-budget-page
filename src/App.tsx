import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import { legacyRedirects } from "@/lib/routes";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import AccessDenied from "./pages/AccessDenied";
import Dashboard from "./pages/Dashboard";
import Account from "./pages/Account";
import Instances from "./pages/Instances";
import InstanceDetail from "./pages/InstanceDetail";
import AIAgents from "./pages/AIAgents";
import Campaigns from "./pages/Campaigns";
import Subscription from "./pages/Subscription";
import CompanyInvoices from "./pages/CompanyInvoices";
import CompanyUsers from "./pages/CompanyUsers";
import AdminCompanies from "./pages/admin/Companies";
import AdminSubscriptions from "./pages/admin/Subscriptions";
import AdminInstances from "./pages/admin/Instances";
import AdminPlans from "./pages/admin/Plans";
import AdminUsers from "./pages/admin/Users";
import AdminInvoices from "./pages/admin/Invoices";
import AdminGateways from "./pages/admin/Gateways";
import AdminReports from "./pages/admin/Reports";
import AdminHealth from "./pages/admin/Health";
import AdminWebhooks from "./pages/admin/Webhooks";
import AdminLogs from "./pages/admin/Logs";
import AdminAIAgents from "./pages/admin/AIAgents";
import AdminCampaigns from "./pages/admin/Campaigns";
import Settings from "./pages/Settings";
import Branding from "./pages/Branding";
import AdminSettings from "./pages/admin/Settings";
import AdminBranding from "./pages/admin/Branding";

import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { CompanyProvider } from "@/contexts/CompanyContext";

const queryClient = new QueryClient();

function ProtectedPage({ children, module, role }: { children: React.ReactNode; module?: string; role?: ('admin' | 'user')[] }) {
  return (
    <ProtectedRoute requiredModule={module} requiredRole={role}>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <BrandingProvider>
            <CompanyProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/access-denied" element={<AccessDenied />} />

              {/* Operational */}
              <Route path="/dashboard" element={<ProtectedPage module="dashboard"><Dashboard /></ProtectedPage>} />
              <Route path="/instances" element={<ProtectedPage module="instances"><Instances /></ProtectedPage>} />
              <Route path="/instances/:id" element={<ProtectedPage module="instances"><InstanceDetail /></ProtectedPage>} />
              <Route path="/ai-agents" element={<ProtectedPage module="ai_agents"><AIAgents /></ProtectedPage>} />
              <Route path="/campaigns" element={<ProtectedPage module="campaigns"><Campaigns /></ProtectedPage>} />

              {/* Admin company */}
              <Route path="/subscription" element={<ProtectedPage><Subscription /></ProtectedPage>} />
              <Route path="/invoices" element={<ProtectedPage><CompanyInvoices /></ProtectedPage>} />
              <Route path="/users" element={<ProtectedPage role={['admin']}><CompanyUsers /></ProtectedPage>} />
              <Route path="/settings" element={<ProtectedPage module="settings"><Settings /></ProtectedPage>} />
              <Route path="/branding" element={<ProtectedPage role={['admin']}><Branding /></ProtectedPage>} />

              {/* Personal */}
              <Route path="/profile" element={<ProtectedPage><Profile /></ProtectedPage>} />
              <Route path="/account" element={<ProtectedPage><Account /></ProtectedPage>} />

              {/* Admin */}
              <Route path="/admin/companies" element={<ProtectedPage role={['admin']}><AdminCompanies /></ProtectedPage>} />
              <Route path="/admin/subscriptions" element={<ProtectedPage role={['admin']}><AdminSubscriptions /></ProtectedPage>} />
              <Route path="/admin/instances" element={<ProtectedPage role={['admin']}><AdminInstances /></ProtectedPage>} />
              <Route path="/admin/plans" element={<ProtectedPage role={['admin']}><AdminPlans /></ProtectedPage>} />
              <Route path="/admin/users" element={<ProtectedPage role={['admin']}><AdminUsers /></ProtectedPage>} />
              <Route path="/admin/invoices" element={<ProtectedPage role={['admin']}><AdminInvoices /></ProtectedPage>} />
              <Route path="/admin/gateways" element={<ProtectedPage role={['admin']}><AdminGateways /></ProtectedPage>} />
              <Route path="/admin/reports" element={<ProtectedPage role={['admin']}><AdminReports /></ProtectedPage>} />
              <Route path="/admin/health" element={<ProtectedPage role={['admin']}><AdminHealth /></ProtectedPage>} />
              <Route path="/admin/webhooks" element={<ProtectedPage role={['admin']}><AdminWebhooks /></ProtectedPage>} />
              <Route path="/admin/logs" element={<ProtectedPage role={['admin']}><AdminLogs /></ProtectedPage>} />
              <Route path="/admin/ai-agents" element={<ProtectedPage role={['admin']}><AdminAIAgents /></ProtectedPage>} />
              <Route path="/admin/campaigns" element={<ProtectedPage role={['admin']}><AdminCampaigns /></ProtectedPage>} />
              <Route path="/admin/settings" element={<ProtectedPage role={['admin']}><AdminSettings /></ProtectedPage>} />
              <Route path="/admin/branding" element={<ProtectedPage role={['admin']}><AdminBranding /></ProtectedPage>} />

              {/* Legacy redirects */}
              {legacyRedirects.map(path => (
                <Route key={path} path={path} element={<Navigate to="/dashboard" replace />} />
              ))}

              <Route path="*" element={<NotFound />} />
            </Routes>
            </CompanyProvider>
            </BrandingProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
