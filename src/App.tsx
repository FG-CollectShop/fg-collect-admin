import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/AuthContext";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppShell } from "@/layout/AppShell";
import { ErrorBoundary } from "@/layout/ErrorBoundary";
import { LoginPage } from "@/pages/LoginPage";
import { SetsPage } from "@/pages/SetsPage";
import { SetDetailPage } from "@/pages/SetDetailPage";
import { GradedInventoryPage } from "@/pages/GradedInventoryPage";
import { GradedIntakePage } from "@/pages/GradedIntakePage";
import { PricingRulesPage } from "@/pages/PricingRulesPage";
import { BinsPage } from "@/pages/BinsPage";
import { WhereIsPage } from "@/pages/WhereIsPage";
import { AcquisitionsPage } from "@/pages/AcquisitionsPage";
import { PrintLabelsPage } from "@/pages/PrintLabelsPage";
import { PortfolioGamesPage } from "@/pages/PortfolioGamesPage";
import { PortfolioSetsPage } from "@/pages/PortfolioSetsPage";
import { PortfolioSetCardsPage } from "@/pages/PortfolioSetCardsPage";
import ManifestPage from "@/pages/ManifestPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Tokens auto-refresh; we don't need aggressive refetch.
      staleTime: 30_000,
      retry: (failureCount, err) => {
        // Don't retry auth failures.
        if (err && typeof err === "object" && "status" in err) {
          const s = (err as { status: number }).status;
          if (s === 401 || s === 403) return false;
        }
        return failureCount < 2;
      },
    },
  },
});

const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter basename={basename}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/*"
              element={
                <RequireAuth>
                  <AppShell>
                    <ErrorBoundary>
                      <Routes>
                      <Route path="/" element={<Navigate to="/manifest" replace />} />
                      <Route path="/sets" element={<SetsPage />} />
                      <Route path="/sets/:id" element={<SetDetailPage />} />
                      <Route path="/inventory/graded" element={<GradedInventoryPage />} />
                      <Route path="/inventory/graded/new" element={<GradedIntakePage />} />
                      <Route path="/inventory/print" element={<PrintLabelsPage />} />
                      <Route path="/pricing" element={<PricingRulesPage />} />
                      <Route path="/bins" element={<BinsPage />} />
                      <Route path="/where" element={<WhereIsPage />} />
                      <Route path="/acquisitions" element={<AcquisitionsPage />} />
                      <Route path="/acquisitions/:id" element={<AcquisitionsPage />} />
                      <Route path="/manifest" element={<ManifestPage />} />
                      <Route path="/portfolio" element={<PortfolioGamesPage />} />
                      <Route path="/portfolio/:game" element={<PortfolioSetsPage />} />
                      <Route path="/portfolio/:game/:setId" element={<PortfolioSetCardsPage />} />
                      <Route path="*" element={<Navigate to="/portfolio" replace />} />
                      </Routes>
                    </ErrorBoundary>
                  </AppShell>
                </RequireAuth>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
