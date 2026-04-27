import { useCallback, useEffect, useRef, useState } from "react";
import { type VersionInfo, api } from "../api/client";

interface UseVersionOptions {
  /** Request a fresh update check on initial mount. */
  freshOnMount?: boolean;
}

let cachedVersion: VersionInfo | null = null;
let cachedError: Error | null = null;
let inFlightVersionRequest: Promise<VersionInfo> | null = null;

/**
 * Hook to fetch and cache server version info.
 *
 * Returns:
 * - version: Version info (current, latest, updateAvailable, optional capabilities)
 * - loading: Whether the fetch is in progress
 * - error: Any error that occurred during fetch
 * - refetch: Function to manually refresh version info
 */
export function useVersion(options?: UseVersionOptions) {
  const [version, setVersion] = useState<VersionInfo | null>(cachedVersion);
  const [loading, setLoading] = useState(!cachedVersion && !cachedError);
  const [error, setError] = useState<Error | null>(cachedError);
  const hasFetchedRef = useRef(false);

  const fetchVersion = useCallback(async (fresh = false) => {
    if (!fresh && cachedVersion) {
      setVersion(cachedVersion);
      setError(cachedError);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const request =
        fresh || !inFlightVersionRequest
          ? api.getVersion({ fresh })
          : inFlightVersionRequest;
      if (!fresh) {
        inFlightVersionRequest = request;
      }
      const data = await request;
      cachedVersion = data;
      cachedError = null;
      setVersion(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      cachedError = error;
      setError(error);
    } finally {
      if (!fresh) {
        inFlightVersionRequest = null;
      }
      setLoading(false);
    }
  }, []);

  // Initial fetch - only once (avoid StrictMode double-fetch)
  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    void fetchVersion(options?.freshOnMount ?? false);
  }, [fetchVersion, options?.freshOnMount]);

  return {
    version,
    loading,
    error,
    refetch: () => fetchVersion(false),
    refetchFresh: () => fetchVersion(true),
  };
}
