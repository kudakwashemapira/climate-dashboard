/** Short confirmations and errors after an action (shadcn/ui's Sonner), announced to screen readers. */
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Toaster } from "./shadcn/sonner";

interface ToastApi { success: (text: string) => void; error: (text: string) => void }

// Errors stay longer.
const api: ToastApi = {
  success: (text) => { toast.success(text, { duration: 4500 }); },
  error: (text) => { toast.error(text, { duration: 9000 }); },
};

export const useToast = (): ToastApi => api;

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster position="bottom-right" closeButton visibleToasts={4} />
    </>
  );
}
