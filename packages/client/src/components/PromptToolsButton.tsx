import type { PromptTool } from "@yep-anywhere/shared";
import { Command, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface PromptToolsButtonProps {
  tools: PromptTool[];
  onSelectTool: (tool: PromptTool) => void;
  /** Whether the button should be disabled */
  disabled?: boolean;
}

/**
 * Button that shows prompt tools such as slash commands and skills.
 * Selecting a command inserts its prompt syntax into the message input.
 */
export function PromptToolsButton({
  tools,
  onSelectTool,
  disabled,
}: PromptToolsButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close menu on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setQuery("");
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleToolClick = useCallback(
    (tool: PromptTool) => {
      onSelectTool(tool);
      setIsOpen(false);
      setQuery("");
    },
    [onSelectTool],
  );

  const handleToggle = useCallback(() => {
    setIsOpen((open) => {
      const nextOpen = !open;
      if (!nextOpen) setQuery("");
      return nextOpen;
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [isOpen]);

  const filteredTools = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return tools;
    return tools.filter((tool) => {
      const command = `${tool.trigger}${tool.name}`.toLowerCase();
      return (
        command.includes(normalizedQuery) ||
        tool.name.toLowerCase().includes(normalizedQuery) ||
        tool.description?.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [tools, query]);

  const slashTools = filteredTools.filter((tool) => tool.trigger === "/");
  const dollarTools = filteredTools.filter((tool) => tool.trigger === "$");
  const groups = [
    { label: "Slash commands", tools: slashTools },
    { label: "Codex skills", tools: dollarTools },
  ].filter((group) => group.tools.length > 0);

  // Don't render if no commands available
  if (tools.length === 0) {
    return null;
  }

  return (
    <div className="slash-command-container">
      <button
        ref={buttonRef}
        type="button"
        className={`slash-command-button ${isOpen ? "active" : ""}`}
        onClick={handleToggle}
        disabled={disabled}
        title="Prompt tools"
        aria-label="Show prompt tools"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <Command size={16} aria-hidden="true" />
      </button>
      {isOpen && (
        <div
          ref={menuRef}
          className="slash-command-menu"
          role="menu"
          aria-label="Prompt tools"
        >
          <div className="slash-command-search">
            <Search size={14} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search commands"
              aria-label="Search prompt tools"
            />
          </div>
          {groups.map((group) => (
            <div key={group.label} className="slash-command-group">
              <div className="slash-command-group-label">{group.label}</div>
              {group.tools.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  className="slash-command-item"
                  onClick={() => handleToolClick(tool)}
                  role="menuitem"
                  title={tool.description}
                >
                  <span className="slash-command-name">
                    {tool.trigger}
                    {tool.name}
                    {tool.argumentHint && (
                      <span className="slash-command-argument">
                        {" "}
                        {tool.argumentHint}
                      </span>
                    )}
                  </span>
                  {tool.description && (
                    <span className="slash-command-description">
                      {tool.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
          {groups.length === 0 && (
            <div className="slash-command-empty">No commands found</div>
          )}
        </div>
      )}
    </div>
  );
}
