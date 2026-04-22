import { ChevronRight, FolderSearch } from "lucide-react";
import { useState } from "react";
import { api } from "../api/client";
import { useToastContext } from "../contexts/ToastContext";
import { useI18n } from "../i18n";
import type { Project } from "../types";
import { FolderTreePicker } from "./FolderTreePicker";

interface NewSessionProjectPickerProps {
  currentProject: Project | null;
  isStarting?: boolean;
  onProjectChange: (project: Project) => void;
  onProjectAdded: () => Promise<void> | void;
}

export function NewSessionProjectPicker({
  currentProject,
  isStarting,
  onProjectChange,
  onProjectAdded,
}: NewSessionProjectPickerProps) {
  const { t } = useI18n();
  const { showToast } = useToastContext();
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);

  const handleSelectFolder = async (folderPath: string) => {
    try {
      const { project } = await api.addProject(folderPath);
      await onProjectAdded();
      onProjectChange(project);
      setIsBrowserOpen(false);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : t("newSessionProjectAddFailed"),
        "error",
      );
    }
  };

  return (
    <section className="new-session-project-section">
      <div className="new-session-field-label">
        {t("newSessionProjectTitle")}
      </div>
      <button
        type="button"
        className="new-session-project-button"
        onClick={() => setIsBrowserOpen(true)}
        disabled={isStarting}
      >
        <span className="new-session-project-button-icon">
          <FolderSearch size={16} aria-hidden="true" />
        </span>
        <span className="new-session-project-button-copy">
          <span className="new-session-project-button-title">
            {currentProject?.name ?? t("projectSelectorSelectProject")}
          </span>
          <span className="new-session-project-button-path">
            {currentProject?.path ?? t("newSessionProjectBrowseAction")}
          </span>
        </span>
        <ChevronRight
          className="new-session-project-button-chevron"
          size={18}
          aria-hidden="true"
        />
      </button>

      {isBrowserOpen && (
        <FolderTreePicker
          initialPath={currentProject?.path}
          onSelect={handleSelectFolder}
          onClose={() => setIsBrowserOpen(false)}
        />
      )}
    </section>
  );
}
