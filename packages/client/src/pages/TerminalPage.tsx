import "@xterm/xterm/css/xterm.css";
import { Terminal } from "lucide-react";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { useRemoteBasePath } from "../hooks/useRemoteBasePath";
import { useVersion } from "../hooks/useVersion";
import { isRemoteClient } from "../lib/connection";
import { browserTerminalSession } from "../lib/terminalSession";

export function TerminalPage() {
  const navigate = useNavigate();
  const basePath = useRemoteBasePath();
  const { version, loading } = useVersion();
  const terminalEnabled = version?.capabilities?.includes("terminal") ?? false;
  const terminalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!terminalEnabled || isRemoteClient()) return;
    const container = terminalRef.current;
    if (!container) return;
    return browserTerminalSession.attach(container);
  }, [terminalEnabled]);

  const goBack = () => {
    navigate(`${basePath}/projects`);
  };

  if (isRemoteClient()) {
    return (
      <div className="terminal-page terminal-page-message">
        <Terminal size={22} aria-hidden="true" />
        <h1>Terminal is available only from the local app</h1>
        <p>Remote relay clients do not open raw terminal WebSockets.</p>
        <button type="button" className="inbox-refresh-button" onClick={goBack}>
          Back
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <LoadingIndicator
        className="loading-indicator-page"
        label="Loading terminal"
      />
    );
  }

  if (!terminalEnabled) {
    return (
      <div className="terminal-page terminal-page-message">
        <Terminal size={22} aria-hidden="true" />
        <h1>Terminal is disabled</h1>
        <p>
          Set TERMINAL_ENABLED=true on the server to enable terminal access.
        </p>
        <button type="button" className="inbox-refresh-button" onClick={goBack}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="terminal-page">
      <main className="terminal-page-body">
        <div ref={terminalRef} className="terminal-surface" />
      </main>
    </div>
  );
}
