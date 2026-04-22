import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { NewSessionForm } from "../components/NewSessionForm";
import { PageHeader } from "../components/PageHeader";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useProject, useProjects } from "../hooks/useProjects";
import { resolvePreferredProjectId } from "../hooks/useRecentProject";
import { useI18n } from "../i18n";
import { useNavigationLayout } from "../layouts";
import type { Project } from "../types";

export function NewSessionPage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get("projectId");
  const { openSidebar, isWideScreen, toggleSidebar, isSidebarCollapsed } =
    useNavigationLayout();

  // Get all projects to find default if no projectId specified
  const {
    projects,
    loading: projectsLoading,
    refetch: refetchProjects,
  } = useProjects();

  // Use the provided projectId, or the preferred recent project when available
  const effectiveProjectId = projectId || resolvePreferredProjectId(projects);

  const {
    project,
    loading: projectLoading,
    error,
  } = useProject(effectiveProjectId ?? undefined);
  const [optimisticProject, setOptimisticProject] = useState<Project | null>(
    null,
  );
  const displayedProject =
    project ??
    (optimisticProject?.id === effectiveProjectId ? optimisticProject : null);

  useEffect(() => {
    if (project) {
      setOptimisticProject(project);
    }
  }, [project]);

  // Update browser tab title (must be called unconditionally before any early returns)
  useDocumentTitle(displayedProject?.name, t("newSessionTitle"));

  // Callback to update projectId in URL without navigation
  const handleProjectChange = (newProject: Project) => {
    setOptimisticProject(newProject);
    setSearchParams({ projectId: newProject.id }, { replace: true });
  };

  const loading = projectsLoading || (projectLoading && !displayedProject);

  // Guard against missing projectId (no projects available)
  if (!effectiveProjectId && !projectsLoading && projects.length === 0) {
    return <div className="error">{t("newSessionNoProjects")}</div>;
  }

  // Render loading/error states
  if (loading) {
    return (
      <LoadingIndicator
        className="loading-indicator-page"
        label={t("newSessionLoading")}
      />
    );
  }

  if (error && !displayedProject) {
    return (
      <div
        className={
          isWideScreen ? "main-content-wrapper" : "main-content-mobile"
        }
      >
        <div
          className={
            isWideScreen
              ? "main-content-constrained"
              : "main-content-mobile-inner"
          }
        >
          <PageHeader
            title={t("newSessionTitle")}
            onOpenSidebar={openSidebar}
            onToggleSidebar={toggleSidebar}
            isWideScreen={isWideScreen}
            isSidebarCollapsed={isSidebarCollapsed}
          />
          <main className="page-scroll-container">
            <div className="page-content-inner">
              <div className="error">
                {t("newSessionErrorPrefix")} {error?.message}
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div
      className={isWideScreen ? "main-content-wrapper" : "main-content-mobile"}
    >
      <div
        className={
          isWideScreen
            ? "main-content-constrained"
            : "main-content-mobile-inner"
        }
      >
        <PageHeader
          title={t("newSessionTitle")}
          onOpenSidebar={openSidebar}
          onToggleSidebar={toggleSidebar}
          isWideScreen={isWideScreen}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        <main className="page-scroll-container">
          <div className="page-content-inner">
            {effectiveProjectId && (
              <NewSessionForm
                projectId={effectiveProjectId}
                project={displayedProject}
                onProjectChange={handleProjectChange}
                onProjectAdded={refetchProjects}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
