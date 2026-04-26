import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/auth/AuthContext";
import { RequireAuth } from "@/auth/RequireAuth";
import { AppShell } from "@/layout/AppShell";
import { LoginPage } from "@/pages/LoginPage";
import { SetsPage } from "@/pages/SetsPage";
import { SetDetailPage } from "@/pages/SetDetailPage";
import { InventoryPage } from "@/pages/InventoryPage";
import { InventoryNewPage } from "@/pages/InventoryNewPage";
import { ListingsPage } from "@/pages/ListingsPage";
import { OrdersPage } from "@/pages/OrdersPage";

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
                    <Routes>
                      <Route path="/" element={<Navigate to="/sets" replace />} />
                      <Route path="/sets" element={<SetsPage />} />
                      <Route path="/sets/:id" element={<SetDetailPage />} />
                      <Route path="/inventory" element={<InventoryPage />} />
                      <Route path="/inventory/new" element={<InventoryNewPage />} />
                      <Route path="/listings" element={<ListingsPage />} />
                      <Route path="/orders" element={<OrdersPage />} />
                      <Route path="*" element={<Navigate to="/sets" replace />} />
                    </Routes>
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
