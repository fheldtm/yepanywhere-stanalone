export interface ParsedSessionRoute {
  projectId: string;
  sessionId: string;
}

export function buildSessionRoute(
  projectId: string,
  sessionId: string,
  basePath = "",
): string {
  return `${basePath}/projects/${projectId}/sessions/${sessionId}`;
}

export function parseSessionRoute(pathname: string): ParsedSessionRoute | null {
  const match = pathname.match(/(?:^|\/)projects\/([^/]+)\/sessions\/([^/]+)/);
  if (!match?.[1] || !match[2]) return null;
  return {
    projectId: decodeURIComponent(match[1]),
    sessionId: decodeURIComponent(match[2]),
  };
}

export function isSessionRoute(pathname: string): boolean {
  return parseSessionRoute(pathname) !== null;
}
