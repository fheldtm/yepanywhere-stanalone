import { Command } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface PromptToolsButtonProps {
  /** Available slash commands (without the "/" prefix) */
  commands: string[];
  /** Callback when a command is selected */
  onSelectCommand: (command: string) => void;
  /** Whether the button should be disabled */
  disabled?: boolean;
}

/**
 * Button that shows prompt tools such as slash commands and skills.
 * Selecting a command inserts its prompt syntax into the message input.
 */
export function PromptToolsButton({
  commands,
  onSelectCommand,
  disabled,
}: PromptToolsButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleCommandClick = useCallback(
    (command: string) => {
      onSelectCommand(`/${command}`);
      setIsOpen(false);
    },
    [onSelectCommand],
  );

  // Don't render if no commands available
  if (commands.length === 0) {
    return null;
  }

  return (
    <div className="slash-command-container">
      <button
        ref={buttonRef}
        type="button"
        className={`slash-command-button ${isOpen ? "active" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
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
          {commands.map((command) => (
            <button
              key={command}
              type="button"
              className="slash-command-item"
              onClick={() => handleCommandClick(command)}
              role="menuitem"
            >
              /{command}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
