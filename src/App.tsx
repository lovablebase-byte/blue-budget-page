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
import { lazy, Suspense } from "react";

import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";

// Lazy-loaded pages
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Account = lazy(() => import("./pages/Account"));
const Instances = lazy(() => import("./pages/Instances"));
const InstanceDetail = lazy(() => import("./pages/InstanceDetail"));
const AIAgents = lazy(() => import("./pages/AIAgents"));
const Campaigns = lazy(() => import("./pages/Campaigns"));
const Subscription = lazy(() => import("./pages/Subscription"));
const CompanyInvoices = lazy(() => import("./pages/CompanyInvoices"));
const CompanyUsers = lazy(() => import("./pages/CompanyUsers"));
const Settings = lazy(() => import("./pages/Settings"));
const Branding = lazy(() => import("./pages/Branding"));
const Profile = lazy(() => import("./pages/Profile"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Admin pages
const AdminCompanies = lazy(() => import("./pages/admin/Companies"));
const AdminSubscriptions = lazy(() => import("./pages/admin/Subscriptions"));
const AdminInstances = lazy(() => import("./pages/admin/Instances"));
const AdminPlans = lazy(() => import("./pages/admin/Plans"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const AdminInvoices = lazy(() => import("./pages/admin/Invoices"));
const AdminGateways = lazy(() => import("./pages/admin/Gateways"));
const AdminReports = lazy(() => import("./pages/admin/Reports"));
const AdminHealth = lazy(() => import("./pages/admin/Health"));
const AdminWebhooks = lazy(() => import("./pages/admin/Webhooks"));
const AdminLogs = lazy(() => import("./pages/admin/Logs"));
const AdminAIAgents = lazy(() => import("./pages/admin/AIAgents"));
const AdminCampaigns = lazy(() => import("./pages/admin/Campaigns"));
const AdminSettings = lazy(() => import("./pages/admin/Settings"));
const AdminBranding = lazy(() => import("./pages/admin/Branding"));

import { BrandingProvider } from "@/contexts/BrandingContext";
import { CompanyProvider } from "@/contexts/CompanyContext";

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

function ProtectedPage({ children, module, role }: { children: React.ReactNode; module?: string; role?: ('admin' | 'user')[] }) {
  return (
    <ProtectedRoute requiredModule={module} requiredRole={role}>
      <AppLayout>
        <Suspense fallback={<PageLoader />}>{children}</Suspense>
      </AppLayout>
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

              <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFound /></Suspense>} />
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
