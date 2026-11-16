/** Class names for the shadcn/ui components (components/shadcn): later classes win over earlier ones that clash. */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
