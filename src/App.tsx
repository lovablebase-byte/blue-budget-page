import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import AccessDenied from "./pages/AccessDenied";
import Dashboard from "./pages/Dashboard";
import Account from "./pages/Account";
import Instances from "./pages/Instances";
import InstanceDetail from "./pages/InstanceDetail";
import Greetings from "./pages/Greetings";
import Absence from "./pages/Absence";
import StatusPage from "./pages/Status";
import ChatbotKeys from "./pages/ChatbotKeys";
import Workflows from "./pages/Workflows";
import ChatbotKeywords from "./pages/ChatbotKeywords";
import AIAgents from "./pages/AIAgents";
import Campaigns from "./pages/Campaigns";
import Subscription from "./pages/Subscription";
import CompanyInvoices from "./pages/CompanyInvoices";
import CompanyUsers from "./pages/CompanyUsers";
import AdminCompanies from "./pages/admin/Companies";
import AdminInstances from "./pages/admin/Instances";
import AdminPlans from "./pages/admin/Plans";
import AdminUsers from "./pages/admin/Users";
import AdminInvoices from "./pages/admin/Invoices";
import AdminGateways from "./pages/admin/Gateways";
import AdminReports from "./pages/admin/Reports";
import AdminHealth from "./pages/admin/Health";
import AdminWebhooks from "./pages/admin/Webhooks";
import AdminLogs from "./pages/admin/Logs";
import Settings from "./pages/Settings";
import Branding from "./pages/Branding";

import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import { BrandingProvider } from "@/contexts/BrandingContext";

const queryClient = new QueryClient();

function ProtectedPage({ children, module, role }: { children: React.ReactNode; module?: string; role?: ('admin' | 'user')[] }) {
  return (
    <ProtectedRoute requiredModule={module} requiredRole={role}>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <BrandingProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/access-denied" element={<AccessDenied />} />

              {/* Operational */}
              <Route path="/dashboard" element={<ProtectedPage module="dashboard"><Dashboard /></ProtectedPage>} />
              <Route path="/instances" element={<ProtectedPage module="instances"><Instances /></ProtectedPage>} />
              <Route path="/instances/:id" element={<ProtectedPage module="instances"><InstanceDetail /></ProtectedPage>} />
              <Route path="/greetings" element={<ProtectedPage module="greetings"><Greetings /></ProtectedPage>} />
              <Route path="/absence" element={<ProtectedPage module="absence"><Absence /></ProtectedPage>} />
              <Route path="/status" element={<ProtectedPage module="status"><StatusPage /></ProtectedPage>} />
              <Route path="/chatbot-keys" element={<ProtectedPage module="chatbot_keys"><ChatbotKeys /></ProtectedPage>} />
              <Route path="/workflow" element={<ProtectedPage module="workflow"><Workflows /></ProtectedPage>} />
              <Route path="/chatbot-keywords" element={<ProtectedPage module="chatbot_keys"><ChatbotKeywords /></ProtectedPage>} />
              <Route path="/ai-agents" element={<ProtectedPage module="ai_agents"><AIAgents /></ProtectedPage>} />
              <Route path="/campaigns" element={<ProtectedPage module="campaigns"><Campaigns /></ProtectedPage>} />

              {/* Admin company */}
              <Route path="/subscription" element={<ProtectedPage role={['admin']}><Subscription /></ProtectedPage>} />
              <Route path="/invoices" element={<ProtectedPage role={['admin']}><CompanyInvoices /></ProtectedPage>} />
              <Route path="/users" element={<ProtectedPage role={['admin']}><CompanyUsers /></ProtectedPage>} />
              <Route path="/settings" element={<ProtectedPage module="settings"><Settings /></ProtectedPage>} />
              <Route path="/branding" element={<ProtectedPage role={['admin']}><Branding /></ProtectedPage>} />

              {/* Personal */}
              <Route path="/profile" element={<ProtectedPage><Profile /></ProtectedPage>} />
              <Route path="/account" element={<ProtectedPage><Account /></ProtectedPage>} />

              {/* Admin */}
              <Route path="/admin/companies" element={<ProtectedPage role={['admin']}><AdminCompanies /></ProtectedPage>} />
              <Route path="/admin/instances" element={<ProtectedPage role={['admin']}><AdminInstances /></ProtectedPage>} />
              <Route path="/admin/plans" element={<ProtectedPage role={['admin']}><AdminPlans /></ProtectedPage>} />
              <Route path="/admin/users" element={<ProtectedPage role={['admin']}><AdminUsers /></ProtectedPage>} />
              <Route path="/admin/invoices" element={<ProtectedPage role={['admin']}><AdminInvoices /></ProtectedPage>} />
              <Route path="/admin/gateways" element={<ProtectedPage role={['admin']}><AdminGateways /></ProtectedPage>} />
              <Route path="/admin/reports" element={<ProtectedPage role={['admin']}><AdminReports /></ProtectedPage>} />
              <Route path="/admin/health" element={<ProtectedPage role={['admin']}><AdminHealth /></ProtectedPage>} />
              <Route path="/admin/webhooks" element={<ProtectedPage role={['admin']}><AdminWebhooks /></ProtectedPage>} />
              <Route path="/admin/logs" element={<ProtectedPage role={['admin']}><AdminLogs /></ProtectedPage>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
            </BrandingProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
