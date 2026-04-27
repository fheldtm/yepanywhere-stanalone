import { describe, expect, it } from "vitest";
import { buildSessionRoute, isSessionRoute, parseSessionRoute } from "./routes";

describe("session route helpers", () => {
  it("builds session routes with optional base path", () => {
    expect(buildSessionRoute("project", "session")).toBe(
      "/projects/project/sessions/session",
    );
    expect(buildSessionRoute("project", "session", "/relay")).toBe(
      "/relay/projects/project/sessions/session",
    );
  });

  it("parses local session routes", () => {
    expect(parseSessionRoute("/projects/project/sessions/session")).toEqual({
      projectId: "project",
      sessionId: "session",
    });
  });

  it("parses relay-prefixed session routes", () => {
    expect(
      parseSessionRoute("/my-host/projects/project/sessions/session"),
    ).toEqual({
      projectId: "project",
      sessionId: "session",
    });
  });

  it("detects session routes", () => {
    expect(isSessionRoute("/projects/project/sessions/session")).toBe(true);
    expect(isSessionRoute("/sessions")).toBe(false);
  });
});
