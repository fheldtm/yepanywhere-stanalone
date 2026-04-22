import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { InboxContent } from "../components/InboxContent";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { PageHeader } from "../components/PageHeader";
import { useInboxContext } from "../contexts/InboxContext";
import { useProjects } from "../hooks/useProjects";
import { useI18n } from "../i18n";
import { useNavigationLayout } from "../layouts";

/**
 * Global inbox page with project filter dropdown.
 * Shows sessions from all projects (or filtered to one) that need attention.
 */
export function InboxPage() {
  const { t } = useI18n();
  const { openSidebar, isWideScreen } = useNavigationLayout();
  const { projects } = useProjects();
  const { loading } = useInboxContext();
  const [searchParams, setSearchParams] = useSearchParams();

  const projectId = searchParams.get("project") ?? undefined;

  const handleProjectChange = useCallback(
    (newProjectId: string | undefined) => {
      if (newProjectId) {
        setSearchParams({ project: newProjectId });
      } else {
        setSearchParams({});
      }
    },
    [setSearchParams],
  );

  // Find project name for header when filtered
  const projectName = useMemo(() => {
    if (!projectId) return undefined;
    return projects.find((p) => p.id === projectId)?.name;
  }, [projectId, projects]);

  if (loading) {
    return (
      <LoadingIndicator
        className="loading-indicator-page"
        label={t("inboxLoading")}
      />
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
          title={
            projectName
              ? t("inboxTitleWithProject", { project: projectName })
              : t("inboxTitle")
          }
          onOpenSidebar={openSidebar}
        />

        <InboxContent
          projectId={projectId}
          projects={projects}
          onProjectChange={handleProjectChange}
        />
      </div>
    </div>
  );
}
