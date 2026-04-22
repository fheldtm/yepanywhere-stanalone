export const SERVICE_WORKER_PATH = `${import.meta.env.BASE_URL}sw.js`;

export function canUseServiceWorker(): boolean {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;

  const { hostname, protocol } = window.location;
  return (
    protocol === "https:" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!canUseServiceWorker()) {
    throw new Error("Service workers are not available in this context");
  }

  return navigator.serviceWorker.register(SERVICE_WORKER_PATH);
}

export function shouldAutoRegisterServiceWorker(): boolean {
  return import.meta.env.PROD && canUseServiceWorker();
}
