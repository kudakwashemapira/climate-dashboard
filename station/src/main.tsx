import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { TooltipProvider } from "./components/shadcn/tooltip";
import { ToastProvider } from "./components/Toast";
import { NetworkError } from "./services/http";
import "./index.css";

// Server state lives in TanStack Query (CD-3.07 section 6.2). A read is retried only when no reply
// arrived: an answer the server did send (not found, not allowed) will not change on a retry.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failures, error) => error instanceof NetworkError && failures < 2,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ToastProvider>
          <TooltipProvider delayDuration={300}>
            <App />
          </TooltipProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
