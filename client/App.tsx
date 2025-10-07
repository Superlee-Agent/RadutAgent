import "./global.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

declare global {
  interface Window {
    __privyAnalyticsFetchPatched?: boolean;
  }
}

const ensurePrivyAnalyticsFetchPatched = () => {
  if (typeof window === "undefined") return;
  if (window.__privyAnalyticsFetchPatched) return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    try {
      return await originalFetch(...args);
    } catch (error) {
      const input = args[0];
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : undefined;
      if (url && url.includes("edge.fullstory.com")) {
        return new Response(null, {
          status: 204,
          statusText: "No Content",
        });
      }
      throw error;
    }
  };
  window.__privyAnalyticsFetchPatched = true;
};

const queryClient = new QueryClient();
const privyAppId = import.meta.env.VITE_PRIVY_APP_ID;

const AppRoutes = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Index />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  </BrowserRouter>
);

const App = () => {
  ensurePrivyAnalyticsFetchPatched();

  if (!privyAppId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-black text-slate-200">
        <p className="text-sm font-medium">
          Konfigurasi Privy tidak ditemukan. Tambahkan VITE_PRIVY_APP_ID pada environment.
        </p>
      </div>
    );
  }

  return (
    <PrivyProvider appId={privyAppId}>
      <QueryClientProvider client={queryClient}>
        <AppRoutes />
      </QueryClientProvider>
    </PrivyProvider>
  );
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
