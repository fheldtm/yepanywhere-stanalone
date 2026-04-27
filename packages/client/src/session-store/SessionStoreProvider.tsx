import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { SessionActivityController } from "./SessionActivityController";
import { SessionDataController } from "./SessionDataController";
import { SessionStore, type SessionStoreOptions } from "./SessionStore";
import { SessionStreamController } from "./SessionStreamController";
import type { SessionEntry, SessionKey, SessionStoreSnapshot } from "./types";

const SessionStoreContext = createContext<SessionStore | null>(null);

export function SessionStoreProvider({
  children,
  options,
}: {
  children: ReactNode;
  options?: SessionStoreOptions;
}) {
  const store = useMemo(() => new SessionStore(options), [options]);
  const controllers = useMemo(() => {
    const dataController = new SessionDataController(store);
    const streamController = new SessionStreamController(store, dataController);
    const activityController = new SessionActivityController(
      store,
      dataController,
    );
    return { dataController, streamController, activityController };
  }, [store]);

  useEffect(() => {
    controllers.activityController.start();
    return () => {
      controllers.activityController.stop();
      controllers.streamController.stopAll();
    };
  }, [controllers]);

  useEffect(() => {
    let reconciling = false;
    return store.subscribe(() => {
      if (reconciling) return;
      reconciling = true;
      for (const key of store.getSnapshot().entries.keys()) {
        controllers.streamController.reconcile(key);
      }
      reconciling = false;
    });
  }, [store, controllers]);

  return (
    <SessionStoreContext.Provider value={store}>
      {children}
    </SessionStoreContext.Provider>
  );
}

export function useSessionStore(): SessionStore {
  const store = useContext(SessionStoreContext);
  if (!store) {
    throw new Error("useSessionStore must be used within SessionStoreProvider");
  }
  return store;
}

export function useOptionalSessionStore(): SessionStore | null {
  return useContext(SessionStoreContext);
}

export function useSessionStoreSnapshot(): SessionStoreSnapshot {
  const store = useSessionStore();
  return useSyncExternalStore(
    store.subscribe.bind(store),
    store.getSnapshot.bind(store),
    store.getSnapshot.bind(store),
  );
}

export function useSessionEntry(key: SessionKey | null): SessionEntry | null {
  const store = useSessionStore();
  const snapshot = useSyncExternalStore(
    store.subscribe.bind(store),
    store.getSnapshot.bind(store),
    store.getSnapshot.bind(store),
  );
  return key ? (snapshot.entries.get(key) ?? null) : null;
}

export function useOptionalSessionEntry(
  key: SessionKey | null,
): SessionEntry | null {
  const store = useOptionalSessionStore();
  return useSyncExternalStore(
    store?.subscribe.bind(store) ?? (() => () => {}),
    () => (key && store ? (store.getEntry(key) ?? null) : null),
    () => null,
  );
}

export function useActiveSessionEntry(): SessionEntry | null {
  const snapshot = useSessionStoreSnapshot();
  return snapshot.activeKey
    ? (snapshot.entries.get(snapshot.activeKey) ?? null)
    : null;
}

export function useSessionTabs() {
  const snapshot = useSessionStoreSnapshot();
  return {
    tabs: snapshot.tabs,
    activeKey: snapshot.activeKey,
  };
}

export function useSessionTabActions() {
  const store = useSessionStore();
  return {
    openTab: store.openTab.bind(store),
    activateTab: store.activateTab.bind(store),
    closeTab: store.closeTab.bind(store),
    closeOtherTabs: store.closeOtherTabs.bind(store),
    closeTabsToRight: store.closeTabsToRight.bind(store),
    pinTab: store.pinTab.bind(store),
    updateTabMetadata: store.updateTabMetadata.bind(store),
  };
}
