import { useEffect, useMemo, useState } from "react";
import { AlertCircle, AudioLines, Bot, Cpu, Loader2, Settings2 } from "lucide-react";
import { OpenDotLogo } from "./components/OpenDotLogo";
import { SidebarUserSettings } from "./components/SidebarUserSettings";
import {
  getCurrentAuthSession,
  signIn as signInToAuth,
  signOut as signOutFromAuth,
  signUp as signUpToAuth,
} from "./lib/authClient";
import {
  normalizeVoiceAgent,
  updateStageModel,
  updateStageSetting,
} from "./lib/pipeline";
import {
  createAgent as createPlatformAgent,
  createDotDevice as createPlatformDotDevice,
  createUserApiKey as createPlatformApiKey,
  deleteDotDevice as deletePlatformDotDevice,
  loadPlatformState,
  revokeUserApiKey as revokePlatformApiKey,
  setPlatformAccessTokenProvider,
  updateAgent as updatePlatformAgent,
  updateDotDevice as updatePlatformDotDevice,
  updateUserSettings as updatePlatformUserSettings,
} from "./lib/platformApi";
import { AgentStudioPage } from "./pages/AgentStudioPage";
import { AuthPage } from "./pages/AuthPage";
import { BrowserTestPage } from "./pages/BrowserTestPage";
import { ConfigurationPage } from "./pages/ConfigurationPage";
import { DotDevicePage } from "./pages/DotDevicePage";
import { SettingsPage } from "./pages/SettingsPage";
import type {
  AuthCredentials,
  AuthSession,
  CreateAgentInput,
  CreateDotDeviceInput,
  DotDevice,
  PipelineStage,
  StageSettingValue,
  UserApiKey,
  UserSettings,
  VoiceAgent,
} from "./types";

type PageId =
  | "agent-studio"
  | "configuration"
  | "browser-test"
  | "dot-device"
  | "settings";

const pageItems = [
  {
    id: "agent-studio",
    path: "/agent-studio",
    icon: Bot,
    label: "Agent Studio",
    helper: "Create and select agents",
  },
  {
    id: "configuration",
    path: "/configuration",
    icon: Settings2,
    label: "Configuration",
    helper: "VAD, STT, LLM, TTS",
  },
  {
    id: "browser-test",
    path: "/browser-test",
    icon: AudioLines,
    label: "Browser Test",
    helper: "Mic, transcript, audio",
  },
  {
    id: "dot-device",
    path: "/dot-device",
    icon: Cpu,
    label: "Dot Device",
    helper: "Pair, bind, update",
  },
  {
    id: "settings",
    path: "/settings",
    icon: Settings2,
    label: "Settings",
    helper: "Profile and SDK keys",
  },
] as const;

const primaryPageItems = pageItems.filter((item) => item.id !== "settings");

const defaultUserSettings: UserSettings = {
  displayName: "Marco",
  email: "",
  workspaceName: "OpenDot Lab",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Zurich",
  compactMode: false,
};

function pageFromPathname(pathname: string): PageId {
  const route = pageItems.find((item) => item.path === pathname);
  return route?.id ?? "agent-studio";
}

export default function App() {
  const [activePage, setActivePage] = useState<PageId>(() =>
    pageFromPathname(window.location.pathname),
  );
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [agents, setAgents] = useState<VoiceAgent[]>([]);
  const [devices, setDevices] = useState<DotDevice[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings>(defaultUserSettings);
  const [apiKeys, setApiKeys] = useState<UserApiKey[]>([]);
  const [platformLoading, setPlatformLoading] = useState(false);
  const [platformError, setPlatformError] = useState<string | null>(null);

  function reportPlatformError(error: unknown) {
    setPlatformError(error instanceof Error ? error.message : String(error));
  }

  useEffect(() => {
    let active = true;

    getCurrentAuthSession()
      .then((session) => {
        if (active) {
          setAuthSession(session);
        }
      })
      .catch((error) => {
        if (active) {
          setAuthError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (active) {
          setAuthLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setPlatformAccessTokenProvider(authSession ? () => authSession.accessToken : null);

    return () => setPlatformAccessTokenProvider(null);
  }, [authSession]);

  useEffect(() => {
    function handlePopState() {
      setActivePage(pageFromPathname(window.location.pathname));
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (authLoading || !authSession) {
      setPlatformLoading(false);
      return;
    }

    let active = true;
    setPlatformLoading(true);

    loadPlatformState()
      .then((state) => {
        if (!active) {
          return;
        }

        const nextAgents = state.agents.map(normalizeVoiceAgent);
        setAgents(nextAgents);
        setDevices(state.devices);
        setUserSettings(state.userSettings);
        setApiKeys(state.apiKeys);
        setSelectedAgentId((current) => current ?? nextAgents[0]?.id ?? null);
        setPlatformError(null);
      })
      .catch((error) => {
        if (active) {
          reportPlatformError(error);
        }
      })
      .finally(() => {
        if (active) {
          setPlatformLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [authLoading, authSession]);

  const normalizedAgents = useMemo(() => agents.map(normalizeVoiceAgent), [agents]);

  const selectedAgent = useMemo(
    () => normalizedAgents.find((agent) => agent.id === selectedAgentId) ?? null,
    [normalizedAgents, selectedAgentId],
  );

  useEffect(() => {
    if (
      selectedAgentId &&
      normalizedAgents.some((agent) => agent.id === selectedAgentId)
    ) {
      return;
    }

    setSelectedAgentId(normalizedAgents[0]?.id ?? null);
  }, [normalizedAgents, selectedAgentId]);

  function navigateToPage(pageId: PageId) {
    const nextPage = pageItems.find((item) => item.id === pageId) ?? pageItems[0];
    window.history.pushState({ pageId }, "", nextPage.path);
    setActivePage(nextPage.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleAuthSubmit(
    mode: "login" | "signup",
    credentials: AuthCredentials,
  ) {
    setAuthSubmitting(true);
    setAuthError(null);

    try {
      const session =
        mode === "signup"
          ? await signUpToAuth(credentials)
          : await signInToAuth(credentials);
      setAuthSession(session);
      setActivePage("agent-studio");
      window.history.replaceState({ pageId: "agent-studio" }, "", "/agent-studio");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleSignOut() {
    await signOutFromAuth();
    setAuthSession(null);
    setAgents([]);
    setDevices([]);
    setSelectedAgentId(null);
    setUserSettings(defaultUserSettings);
    setApiKeys([]);
    setPlatformError(null);
    setPlatformLoading(false);
    window.history.replaceState({}, "", "/login");
  }

  async function handleCreateAgent(input: CreateAgentInput) {
    try {
      const agent = await createPlatformAgent(input);
      setAgents((current) => [normalizeVoiceAgent(agent), ...current]);
      setSelectedAgentId(agent.id);
      setPlatformError(null);
    } catch (error) {
      reportPlatformError(error);
    }
  }

  function handleSettingChange(
    stageId: PipelineStage["id"],
    key: string,
    value: StageSettingValue,
  ) {
    if (!selectedAgent) {
      return;
    }

    const nextAgent = normalizeVoiceAgent({
      ...selectedAgent,
      updatedAt: new Date().toISOString(),
      pipeline: updateStageSetting(selectedAgent.pipeline, stageId, key, value),
    });

    setAgents((current) =>
      current.map((agent) => (agent.id === nextAgent.id ? nextAgent : agent)),
    );
    updatePlatformAgent(nextAgent)
      .then((savedAgent) => {
        setAgents((current) =>
          current.map((agent) =>
            agent.id === savedAgent.id ? normalizeVoiceAgent(savedAgent) : agent,
          ),
        );
        setPlatformError(null);
      })
      .catch(reportPlatformError);
  }

  function handleModelChange(stageId: PipelineStage["id"], model: string) {
    if (!selectedAgent) {
      return;
    }

    const nextAgent = normalizeVoiceAgent({
      ...selectedAgent,
      updatedAt: new Date().toISOString(),
      pipeline: updateStageModel(selectedAgent.pipeline, stageId, model),
    });

    setAgents((current) =>
      current.map((agent) => (agent.id === nextAgent.id ? nextAgent : agent)),
    );
    updatePlatformAgent(nextAgent)
      .then((savedAgent) => {
        setAgents((current) =>
          current.map((agent) =>
            agent.id === savedAgent.id ? normalizeVoiceAgent(savedAgent) : agent,
          ),
        );
        setPlatformError(null);
      })
      .catch(reportPlatformError);
  }

  function handleUserSettingChange<Key extends keyof UserSettings>(
    key: Key,
    value: UserSettings[Key],
  ) {
    const nextSettings = {
      ...userSettings,
      [key]: value,
    };
    setUserSettings(nextSettings);
    updatePlatformUserSettings(nextSettings)
      .then((savedSettings) => {
        setUserSettings(savedSettings);
        setPlatformError(null);
      })
      .catch(reportPlatformError);
  }

  async function handleCreateApiKey(name: string) {
    try {
      const apiKey = await createPlatformApiKey(name);
      setApiKeys((current) => [apiKey, ...current]);
      setPlatformError(null);
    } catch (error) {
      reportPlatformError(error);
    }
  }

  function handleRevokeApiKey(keyId: string) {
    setApiKeys((current) =>
      current.map((key) =>
        key.id === keyId
          ? {
              ...key,
              status: "revoked",
            }
          : key,
      ),
    );
    revokePlatformApiKey(keyId)
      .then((apiKey) => {
        if (!apiKey) {
          return;
        }

        setApiKeys((current) =>
          current.map((key) => (key.id === apiKey.id ? apiKey : key)),
        );
        setPlatformError(null);
      })
      .catch(reportPlatformError);
  }

  async function handleCreateDevice(input: CreateDotDeviceInput) {
    try {
      const device = await createPlatformDotDevice(input);
      setDevices((current) => [device, ...current]);
      setPlatformError(null);
      return device;
    } catch (error) {
      reportPlatformError(error);
      return null;
    }
  }

  async function handleUpdateDevice(device: DotDevice) {
    setDevices((current) => {
      const exists = current.some((item) => item.id === device.id);
      return exists
        ? current.map((item) => (item.id === device.id ? device : item))
        : [device, ...current];
    });

    try {
      const savedDevice = await updatePlatformDotDevice(device);
      setDevices((current) => {
        const exists = current.some((item) => item.id === savedDevice.id);
        return exists
          ? current.map((item) => (item.id === savedDevice.id ? savedDevice : item))
          : [savedDevice, ...current];
      });
      setPlatformError(null);
      return savedDevice;
    } catch (error) {
      reportPlatformError(error);
      return null;
    }
  }

  async function handleRemoveDevice(deviceId: string) {
    setDevices((current) => current.filter((device) => device.id !== deviceId));
    try {
      await deletePlatformDotDevice(deviceId);
      setPlatformError(null);
    } catch (error) {
      reportPlatformError(error);
    }
  }

  if (authLoading) {
    return (
      <main className="auth-shell auth-loading-shell">
        <section className="platform-status-panel" role="status">
          <Loader2 size={18} />
          <span>Checking session</span>
        </section>
      </main>
    );
  }

  if (!authSession) {
    return (
      <AuthPage error={authError} loading={authSubmitting} onSubmit={handleAuthSubmit} />
    );
  }

  return (
    <main className={`app-frame ${userSettings.compactMode ? "compact-density" : ""}`}>
      <aside className="left-sidebar" aria-label="Platform navigation">
        <a
          className="brand"
          href="/agent-studio"
          onClick={(event) => {
            event.preventDefault();
            navigateToPage("agent-studio");
          }}
        >
          <OpenDotLogo className="brand-mark" title="OpenDot" />
          <span>OpenDot</span>
        </a>

        <nav className="side-nav">
          {primaryPageItems.map((item) => {
            const Icon = item.icon;

            return (
              <a
                aria-current={activePage === item.id ? "page" : undefined}
                className={activePage === item.id ? "active" : undefined}
                href={item.path}
                key={item.id}
                onClick={(event) => {
                  event.preventDefault();
                  navigateToPage(item.id);
                }}
              >
                <Icon size={17} />
                <span>
                  {item.label}
                  <small>{item.helper}</small>
                </span>
              </a>
            );
          })}
        </nav>

        <SidebarUserSettings
          active={activePage === "settings"}
          settings={userSettings}
          onOpen={() => navigateToPage("settings")}
        />
      </aside>

      <div className="app-main">
        {platformError ? (
          <section className="platform-status-panel error" role="status">
            <AlertCircle size={18} />
            <span>{platformError}</span>
          </section>
        ) : null}

        {platformLoading ? (
          <section className="platform-status-panel" role="status">
            <Loader2 size={18} />
            <span>Loading platform data</span>
          </section>
        ) : null}

        {!platformLoading && activePage === "agent-studio" ? (
          <AgentStudioPage
            agents={normalizedAgents}
            selectedAgentId={selectedAgentId}
            onCreateAgent={handleCreateAgent}
            onSelectAgent={setSelectedAgentId}
          />
        ) : null}

        {!platformLoading && activePage === "configuration" ? (
          <ConfigurationPage
            agent={selectedAgent}
            onModelChange={handleModelChange}
            onSettingChange={handleSettingChange}
          />
        ) : null}

        {!platformLoading && activePage === "browser-test" ? (
          <BrowserTestPage agent={selectedAgent} />
        ) : null}

        {!platformLoading && activePage === "dot-device" ? (
          <DotDevicePage
            agents={normalizedAgents}
            devices={devices}
            selectedAgent={selectedAgent}
            onCreateDevice={handleCreateDevice}
            onRemoveDevice={handleRemoveDevice}
            onUpdateDevice={handleUpdateDevice}
          />
        ) : null}

        {!platformLoading && activePage === "settings" ? (
          <SettingsPage
            apiKeys={apiKeys}
            settings={userSettings}
            onCreateApiKey={handleCreateApiKey}
            onRevokeApiKey={handleRevokeApiKey}
            onSettingChange={handleUserSettingChange}
            onSignOut={handleSignOut}
          />
        ) : null}
      </div>
    </main>
  );
}
