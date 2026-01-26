import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import Upload from "./pages/Upload";
import TranscriptionProgress from "./pages/TranscriptionProgress";
import SessionEditor from "./pages/SessionEditor";
import SessionMinutesView from "./pages/SessionMinutesView";
import Sessions from "./pages/Sessions";
import Assistant from "./pages/Assistant";
import Settings from "./pages/Settings";
import Auth from "./pages/Auth";
import Profile from "./pages/Profile";
import Camaras from "./pages/admin/Camaras";
import Users from "./pages/admin/Users";
import Vereadores from "./pages/admin/Vereadores";
import AdminDashboard from "./pages/admin/Dashboard";
import LegislativeFactory from "./pages/admin/LegislativeFactory";
import NotFound from "./pages/NotFound";
import SessoesList from "./pages/sessao/SessoesList";
import SessaoControl from "./pages/sessao/SessaoControl";
import SessaoVereador from "./pages/sessao/SessaoVereador";
import PlenarioDisplay from "./pages/sessao/PlenarioDisplay";
import Ouvidoria from "./pages/admin/Ouvidoria";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-right" />
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={
              <ProtectedRoute>
                <Index />
              </ProtectedRoute>
            } />
            <Route path="/upload" element={
              <ProtectedRoute disallowCargo="Vereador">
                <Upload />
              </ProtectedRoute>
            } />
            <Route path="/transcription/:id" element={
              <ProtectedRoute>
                <TranscriptionProgress />
              </ProtectedRoute>
            } />
            <Route path="/session/:id/edit" element={
              <ProtectedRoute disallowCargo="Vereador">
                <SessionEditor />
              </ProtectedRoute>
            } />
            <Route path="/session/:id/minutes" element={
              <ProtectedRoute>
                <SessionMinutesView />
              </ProtectedRoute>
            } />
            <Route path="/sessions" element={
              <ProtectedRoute>
                <Sessions />
              </ProtectedRoute>
            } />
            <Route path="/assistant" element={
              <ProtectedRoute>
                <Assistant />
              </ProtectedRoute>
            } />
            <Route path="/legislative-factory" element={
              <ProtectedRoute>
                <LegislativeFactory />
              </ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            } />
            <Route path="/profile" element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } />
            <Route path="/admin/camaras" element={
              <ProtectedRoute requiredRole="super_admin">
                <Camaras />
              </ProtectedRoute>
            } />
            <Route path="/admin/users" element={
              <ProtectedRoute requiredRole="admin">
                <Users />
              </ProtectedRoute>
            } />
            <Route path="/admin/vereadores" element={
              <ProtectedRoute requiredRole="admin">
                <Vereadores />
              </ProtectedRoute>
            } />
            <Route path="/admin/ouvidoria" element={
              <ProtectedRoute requiredRole="admin">
                <Ouvidoria />
              </ProtectedRoute>
            } />
            <Route path="/admin/dashboard" element={
              <ProtectedRoute requiredRole="super_admin">
                <AdminDashboard />
              </ProtectedRoute>
            } />
            <Route path="/sessoes" element={
              <ProtectedRoute>
                <SessoesList />
              </ProtectedRoute>
            } />
            <Route path="/sessao/:id/controle" element={
              <ProtectedRoute requiredRole="admin" allowMesa={['Presidente', '1º Secretário', 'Secretário', 'Secretario']}>
                <SessaoControl />
              </ProtectedRoute>
            } />
            <Route path="/sessao/:id/vereador" element={
              <ProtectedRoute>
                <SessaoVereador />
              </ProtectedRoute>
            } />
            <Route path="/plenario/:id" element={<PlenarioDisplay />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
