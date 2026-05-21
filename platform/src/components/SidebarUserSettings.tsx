import { Settings2, UserRound } from "lucide-react";
import type { UserSettings } from "../types";

type SidebarUserSettingsProps = {
  active: boolean;
  settings: UserSettings;
  onOpen: () => void;
};

export function SidebarUserSettings({
  active,
  settings,
  onOpen,
}: SidebarUserSettingsProps) {
  return (
    <a
      aria-current={active ? "page" : undefined}
      className={`sidebar-settings-link ${active ? "active" : ""}`}
      href="/settings"
      onClick={(event) => {
        event.preventDefault();
        onOpen();
      }}
    >
      <span className="settings-avatar">
        <UserRound size={16} />
      </span>
      <span className="settings-summary-copy">
        <strong>{settings.displayName || "User"}</strong>
        <small>{settings.workspaceName || "Workspace"}</small>
      </span>
      <Settings2 size={16} />
    </a>
  );
}
