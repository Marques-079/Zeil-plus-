// client-app/src/lib/utils.js
import clsx from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Tailwind-friendly className combiner
 * Usage: cn("px-2", cond && "bg-red-500")
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
