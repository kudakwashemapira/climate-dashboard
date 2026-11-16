/**
 * Whether this server asks for a one-time code after the password (GET /api/version/, sign_in_code).
 * It always does on staging and production. A development machine without a mail server leaves the
 * step out, because no email could deliver the code (backend config/settings.py); the sign-in pages
 * then word the form accordingly. Until the answer arrives, and if it cannot be read, the code is
 * taken as asked for: the form is then worded for the stricter case.
 */
import { useQuery } from "@tanstack/react-query";
import { get } from "../services/http";

export function useSignInCode(): boolean {
  const info = useQuery({
    queryKey: ["/version/"],
    queryFn: () => get<{ sign_in_code?: boolean }>("/version/"),
    staleTime: Infinity,
    retry: false,
  });
  return info.data?.sign_in_code !== false;
}
