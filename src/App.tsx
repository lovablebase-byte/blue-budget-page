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
const CompanyUsers = lazy(() => import("./pages/CompanyUsers"));
const Settings = lazy(() => import("./pages/Settings"));
const Branding = lazy(() => import("./pages/Branding"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Admin-only pages
const AdminPlans = lazy(() => import("./pages/admin/Plans"));
const AdminSubscriptions = lazy(() => import("./pages/admin/Subscriptions"));
const AdminGateways = lazy(() => import("./pages/admin/Gateways"));
const AdminReports = lazy(() => import("./pages/admin/Reports"));
const AdminHealth = lazy(() => import("./pages/admin/Health"));
const AdminLogs = lazy(() => import("./pages/admin/Logs"));

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

              {/* Administração (admin only) */}
              <Route path="/users" element={<ProtectedPage role={['admin']}><CompanyUsers /></ProtectedPage>} />
              <Route path="/admin/plans" element={<ProtectedPage role={['admin']}><AdminPlans /></ProtectedPage>} />
              <Route path="/admin/subscriptions" element={<ProtectedPage role={['admin']}><AdminSubscriptions /></ProtectedPage>} />
              <Route path="/admin/reports" element={<ProtectedPage role={['admin']}><AdminReports /></ProtectedPage>} />
              <Route path="/admin/gateways" element={<ProtectedPage role={['admin']}><AdminGateways /></ProtectedPage>} />
              <Route path="/admin/logs" element={<ProtectedPage role={['admin']}><AdminLogs /></ProtectedPage>} />
              <Route path="/branding" element={<ProtectedPage role={['admin']}><Branding /></ProtectedPage>} />
              <Route path="/settings" element={<ProtectedPage role={['admin']}><Settings /></ProtectedPage>} />
              <Route path="/admin/health" element={<ProtectedPage role={['admin']}><AdminHealth /></ProtectedPage>} />

              {/* Pessoal */}
              <Route path="/account" element={<ProtectedPage><Account /></ProtectedPage>} />

              {/* Catch sub-routes that no longer exist */}
              <Route path="/campaigns/*" element={<Navigate to="/campaigns" replace />} />
              <Route path="/agents/*" element={<Navigate to="/ai-agents" replace />} />

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
