import {
  ArrowUp,
  ChevronRight,
  Eye,
  EyeOff,
  Folder,
  FolderPlus,
  Pencil,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type DirectoryEntry, api } from "../api/client";
import { useToastContext } from "../contexts/ToastContext";
import { useI18n } from "../i18n";

interface FolderTreePickerProps {
  initialPath?: string;
  onSelect: (path: string) => Promise<void> | void;
  onClose: () => void;
}

function getNameFromPath(path: string): string {
  const trimmed = path.replace(/[\\/]$/, "");
  return trimmed.split(/[\\/]/).pop() || path;
}

function getBreadcrumbs(path: string): Array<{ label: string; path: string }> {
  const normalized = path.replace(/\\/g, "/");
  const isAbsolute = normalized.startsWith("/");
  const parts = normalized.split("/").filter(Boolean);
  const breadcrumbs: Array<{ label: string; path: string }> = [];
  if (isAbsolute) {
    breadcrumbs.push({ label: "/", path: "/" });
  }
  let current = isAbsolute ? "" : "";
  for (const part of parts) {
    current = isAbsolute
      ? `${current}/${part}`
      : current
        ? `${current}/${part}`
        : part;
    breadcrumbs.push({ label: part, path: current || "/" });
  }
  return breadcrumbs;
}

export function FolderTreePicker({
  initialPath,
  onSelect,
  onClose,
}: FolderTreePickerProps) {
  const { t } = useI18n();
  const { showToast } = useToastContext();
  const [currentPath, setCurrentPath] = useState(initialPath ?? "");
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  const loadDirectory = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.getDirectories(path);
        setCurrentPath(response.directory.path);
        setParentPath(response.directory.parentPath);
        setEntries(response.entries);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("folderPickerLoadFailed"),
        );
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (!currentPath) {
      api
        .getFilesystemRoots()
        .then((response) => {
          if (response.roots[0]) {
            setCurrentPath(response.roots[0].path);
          } else {
            setLoading(false);
          }
        })
        .catch((loadError) => {
          setError(
            loadError instanceof Error
              ? loadError.message
              : t("folderPickerLoadFailed"),
          );
          setLoading(false);
        });
    }
  }, [currentPath, t]);

  useEffect(() => {
    if (currentPath) {
      loadDirectory(currentPath);
    }
  }, [currentPath, loadDirectory]);

  const visibleEntries = useMemo(
    () => entries.filter((entry) => showHidden || !entry.isHidden),
    [entries, showHidden],
  );

  const breadcrumbs = useMemo(() => getBreadcrumbs(currentPath), [currentPath]);

  const refresh = () => {
    if (currentPath) {
      loadDirectory(currentPath);
    }
  };

  const handleCreate = async () => {
    const name = newFolderName.trim();
    if (!name || !currentPath) return;
    setBusyPath(currentPath);
    try {
      const { entry } = await api.createDirectory(currentPath, name);
      setNewFolderName("");
      setIsCreateOpen(false);
      await loadDirectory(currentPath);
      setCurrentPath(entry.path);
      showToast(t("folderPickerFolderCreated"), "success");
    } catch (createError) {
      showToast(
        createError instanceof Error
          ? createError.message
          : t("folderPickerCreateFailed"),
        "error",
      );
    } finally {
      setBusyPath(null);
    }
  };

  const handleRename = async (entry: DirectoryEntry) => {
    const name = renameValue.trim();
    if (!name || name === entry.name) {
      setRenamingPath(null);
      return;
    }
    setBusyPath(entry.path);
    try {
      await api.renameDirectory(entry.path, name);
      setRenamingPath(null);
      await loadDirectory(currentPath);
      showToast(t("folderPickerFolderRenamed"), "success");
    } catch (renameError) {
      showToast(
        renameError instanceof Error
          ? renameError.message
          : t("folderPickerRenameFailed"),
        "error",
      );
    } finally {
      setBusyPath(null);
    }
  };

  const handleDelete = async (entry: DirectoryEntry) => {
    if (!entry.canDelete) return;
    const confirmed = window.confirm(
      t("folderPickerDeleteConfirm", { name: entry.name }),
    );
    if (!confirmed) return;
    setBusyPath(entry.path);
    try {
      await api.deleteDirectory(entry.path);
      await loadDirectory(currentPath);
      showToast(t("folderPickerFolderDeleted"), "success");
    } catch (deleteError) {
      showToast(
        deleteError instanceof Error
          ? deleteError.message
          : t("folderPickerDeleteFailed"),
        "error",
      );
    } finally {
      setBusyPath(null);
    }
  };

  const handleSelect = async () => {
    if (!currentPath || isSelecting) return;
    setIsSelecting(true);
    try {
      await onSelect(currentPath);
    } finally {
      setIsSelecting(false);
    }
  };

  return (
    <div className="folder-picker-overlay" onMouseDown={onClose}>
      <div
        className="folder-picker-panel"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="folder-picker-header">
          <div>
            <h2>{t("folderPickerTitle")}</h2>
          </div>
          <button
            type="button"
            className="folder-picker-close"
            onClick={onClose}
            aria-label={t("actionCloseSidebar")}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="folder-picker-navigation">
          <nav
            className="folder-picker-breadcrumbs"
            aria-label={t("folderPickerSelected")}
          >
            {breadcrumbs.map((crumb, index) => (
              <span
                key={`${crumb.path}-${index}`}
                className="folder-picker-breadcrumb-item"
              >
                {index > 0 && (
                  <ChevronRight
                    className="folder-picker-breadcrumb-separator"
                    size={13}
                    aria-hidden="true"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setCurrentPath(crumb.path)}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
          </nav>

          <div className="folder-picker-toolbar">
            <button
              type="button"
              onClick={() => parentPath && setCurrentPath(parentPath)}
              disabled={!parentPath}
              title={t("folderPickerUp")}
              aria-label={t("folderPickerUp")}
            >
              <ArrowUp size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setShowHidden((value) => !value)}
              title={
                showHidden
                  ? t("folderPickerHideHidden")
                  : t("folderPickerShowHidden")
              }
              aria-label={
                showHidden
                  ? t("folderPickerHideHidden")
                  : t("folderPickerShowHidden")
              }
            >
              {showHidden ? (
                <EyeOff size={15} aria-hidden="true" />
              ) : (
                <Eye size={15} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              title={t("folderPickerRefresh")}
              aria-label={t("folderPickerRefresh")}
            >
              <RefreshCw size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setIsCreateOpen((value) => !value)}
              title={t("folderPickerCreate")}
              aria-label={t("folderPickerCreate")}
            >
              <FolderPlus size={15} aria-hidden="true" />
            </button>
          </div>
        </div>

        {isCreateOpen && (
          <form
            className="folder-picker-create"
            onSubmit={(event) => {
              event.preventDefault();
              handleCreate();
            }}
          >
            <input
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              placeholder={t("folderPickerNewFolderPlaceholder")}
              disabled={busyPath === currentPath}
            />
            <button
              type="submit"
              disabled={!newFolderName.trim() || busyPath === currentPath}
            >
              {t("folderPickerCreate")}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreateOpen(false);
                setNewFolderName("");
              }}
            >
              {t("projectsCancel")}
            </button>
          </form>
        )}

        <div className="folder-picker-list">
          {loading && (
            <div className="folder-picker-state">{t("newSessionLoading")}</div>
          )}
          {!loading && error && (
            <div className="folder-picker-state error">{error}</div>
          )}
          {!loading && !error && visibleEntries.length === 0 && (
            <div className="folder-picker-state">{t("folderPickerEmpty")}</div>
          )}
          {!loading &&
            !error &&
            visibleEntries.map((entry) => {
              const isRenaming = renamingPath === entry.path;
              return (
                <button
                  key={entry.path}
                  type="button"
                  className="folder-picker-row"
                  onClick={() => {
                    if (!isRenaming) setCurrentPath(entry.path);
                  }}
                >
                  <div className="folder-picker-folder">
                    <Folder size={16} aria-hidden="true" />
                    {isRenaming ? (
                      <input
                        value={renameValue}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleRename(entry);
                          }
                          if (event.key === "Escape") {
                            setRenamingPath(null);
                          }
                        }}
                      />
                    ) : (
                      <span>{entry.name}</span>
                    )}
                  </div>
                  <span className="folder-picker-row-meta">
                    {entry.isEmpty
                      ? t("folderPickerEmptyFolder")
                      : t("folderPickerNotEmptyFolder")}
                  </span>
                  <div className="folder-picker-row-actions">
                    {isRenaming ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleRename(entry);
                        }}
                        disabled={busyPath === entry.path}
                      >
                        {t("folderPickerSave")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setRenamingPath(entry.path);
                          setRenameValue(entry.name);
                        }}
                        disabled={!entry.canRename || busyPath === entry.path}
                        title={
                          entry.canRename
                            ? t("folderPickerRename")
                            : t("folderPickerEmptyOnly")
                        }
                      >
                        <Pencil size={14} aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDelete(entry);
                      }}
                      disabled={!entry.canDelete || busyPath === entry.path}
                      title={
                        entry.canDelete
                          ? t("folderPickerDelete")
                          : t("folderPickerEmptyOnly")
                      }
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                </button>
              );
            })}
        </div>

        <div className="folder-picker-footer">
          <div className="folder-picker-footer-actions">
            <button type="button" onClick={onClose}>
              {t("projectsCancel")}
            </button>
            <button
              type="button"
              className="primary"
              onClick={handleSelect}
              disabled={!currentPath || isSelecting}
            >
              {isSelecting
                ? t("folderPickerSelecting")
                : t("folderPickerSelectCurrent")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
