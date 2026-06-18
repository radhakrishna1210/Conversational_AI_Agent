import { useEffect } from "react";

interface AIAssistantSidebarProps {
  onClose: () => void;
}

export default function AIAssistantSidebar({ onClose }: AIAssistantSidebarProps) {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <aside className="ai-assistant-sidebar">
      <div className="ai-assistant-sidebar__header">
        <h2>AI Assistant</h2>
        <button type="button" onClick={onClose} aria-label="Close sidebar">
          Close
        </button>
      </div>
      <div className="ai-assistant-sidebar__content">
        <p>This assistant sidebar is currently a placeholder component.</p>
      </div>
    </aside>
  );
}
