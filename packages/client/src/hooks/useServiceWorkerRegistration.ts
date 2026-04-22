import { useEffect } from "react";
import {
  registerServiceWorker,
  shouldAutoRegisterServiceWorker,
} from "../lib/serviceWorker";

export function useServiceWorkerRegistration(): void {
  useEffect(() => {
    if (!shouldAutoRegisterServiceWorker()) return;

    registerServiceWorker().catch((error) => {
      console.warn("[PWA] Failed to register service worker:", error);
    });
  }, []);
}
