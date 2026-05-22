import { FormEvent, useState } from "react";
import { CheckCircle2, Copy, KeyRound, Settings2, Trash2 } from "lucide-react";
import type { UserApiKey, UserSettings } from "../types";

type SettingsPageProps = {
  apiKeys: UserApiKey[];
  settings: UserSettings;
  onCreateApiKey: (name: string) => void;
  onRevokeApiKey: (keyId: string) => void;
  onSettingChange: <Key extends keyof UserSettings>(
    key: Key,
    value: UserSettings[Key],
  ) => void;
};

const timezoneOptions = [
  "Europe/Zurich",
  "UTC",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
];

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function maskToken(token: string | null) {
  if (!token) {
    return "Stored as a hash";
  }

  return `${token.slice(0, 14)}...${token.slice(-6)}`;
}

export function SettingsPage({
  apiKeys,
  settings,
  onCreateApiKey,
  onRevokeApiKey,
  onSettingChange,
}: SettingsPageProps) {
  const [keyName, setKeyName] = useState("");
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const timezones = timezoneOptions.includes(settings.timezone)
    ? timezoneOptions
    : [settings.timezone, ...timezoneOptions];

  function handleCreateKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = keyName.trim();

    if (!name) {
      return;
    }

    onCreateApiKey(name);
    setKeyName("");
  }

  async function copyToken(key: UserApiKey) {
    if (!key.token) {
      return;
    }

    await navigator.clipboard.writeText(key.token);
    setCopiedKeyId(key.id);
    window.setTimeout(() => setCopiedKeyId(null), 1600);
  }

  return (
    <section className="page-section" aria-labelledby="settings-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Settings</p>
          <h2 id="settings-title">User settings</h2>
        </div>
      </div>

      <div className="settings-page-grid">
        <section className="panel user-settings-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Profile</p>
              <h2>Workspace preferences</h2>
            </div>
            <Settings2 size={18} />
          </div>

          <div className="settings-page-fields">
            <label>
              Name
              <input
                value={settings.displayName}
                onChange={(event) => onSettingChange("displayName", event.target.value)}
                placeholder="Name"
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={settings.email}
                onChange={(event) => onSettingChange("email", event.target.value)}
                placeholder="name@example.com"
              />
            </label>
            <label>
              Workspace
              <input
                value={settings.workspaceName}
                onChange={(event) => onSettingChange("workspaceName", event.target.value)}
                placeholder="Workspace"
              />
            </label>
            <label>
              Timezone
              <select
                value={settings.timezone}
                onChange={(event) => onSettingChange("timezone", event.target.value)}
              >
                {timezones.map((timezone) => (
                  <option key={timezone} value={timezone}>
                    {timezone}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-toggle">
              <input
                checked={settings.compactMode}
                type="checkbox"
                onChange={(event) => onSettingChange("compactMode", event.target.checked)}
              />
              <span>Compact density</span>
            </label>
          </div>
        </section>

        <section className="panel api-key-panel">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">SDK</p>
              <h2>API keys</h2>
            </div>
            <KeyRound size={18} />
          </div>

          <form className="api-key-form" onSubmit={handleCreateKey}>
            <label>
              Key name
              <input
                value={keyName}
                onChange={(event) => setKeyName(event.target.value)}
                placeholder="Production SDK"
                required
              />
            </label>
            <button className="primary-button" type="submit">
              <KeyRound size={17} />
              Create key
            </button>
          </form>

          <div className="sdk-env-row">
            <span>OPENDOT_API_KEY</span>
            <strong>{apiKeys.find((key) => key.status === "active")?.prefix ?? "No active key"}</strong>
          </div>

          <div className="api-key-list">
            {apiKeys.length === 0 ? (
              <div className="empty-state compact">
                <KeyRound size={22} />
                <p>No API keys yet.</p>
              </div>
            ) : (
              apiKeys.map((key) => (
                <article className={`api-key-row ${key.status}`} key={key.id}>
                  <div>
                    <strong>{key.name}</strong>
                    <code>{maskToken(key.token)}</code>
                    <span>
                      {key.status} / created {formatTime(key.createdAt)}
                    </span>
                  </div>
                  <div className="api-key-actions">
                    <button
                      type="button"
                      onClick={() => copyToken(key).catch(() => undefined)}
                      disabled={key.status !== "active" || !key.token}
                    >
                      {copiedKeyId === key.id ? <CheckCircle2 size={15} /> : <Copy size={15} />}
                      {copiedKeyId === key.id ? "Copied" : "Copy"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRevokeApiKey(key.id)}
                      disabled={key.status !== "active"}
                    >
                      <Trash2 size={15} />
                      Revoke
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
