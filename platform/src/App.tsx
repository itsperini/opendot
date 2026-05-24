import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  claimDeviceActivation as claimPlatformDeviceActivation,
  createUserApiKey as createPlatformApiKey,
  deleteAgent as deletePlatformAgent,
  deleteDotDevice as deletePlatformDotDevice,
  loadPlatformState,
  revokeUserApiKey as revokePlatformApiKey,
  setPlatformAccessTokenProvider,
  updateAgent as updatePlatformAgent,
  updateDotDevice as updatePlatformDotDevice,
  updateUserSettings as updatePlatformUserSettings,
} from "./lib/platformApi";
import { platformStateQueryKey } from "./lib/queryClient";
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
  RealtimeVoiceAgentConfig,
  StageSettingValue,
  UserSettings,
  VoiceArchitecture,
  VoiceAgent,
} from "./types";
import type { PlatformState } from "./lib/platformApi";

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
    helper: "Create and select identities",
  },
  {
    id: "configuration",
    path: "/configuration",
    icon: Settings2,
    label: "Configuration",
    helper: "Voice pipeline",
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

function withAgent(state: PlatformState, agent: VoiceAgent): PlatformState {
  const nextAgent = normalizeVoiceAgent(agent);
  const agentExists = state.agents.some((item) => item.id === nextAgent.id);

  return {
    ...state,
    agents: agentExists
      ? state.agents.map((item) => (item.id === nextAgent.id ? nextAgent : item))
      : [nextAgent, ...state.agents],
  };
}

function withDevice(state: PlatformState, device: DotDevice): PlatformState {
  const deviceExists = state.devices.some((item) => item.id === device.id);

  return {
    ...state,
    devices: deviceExists
      ? state.devices.map((item) => (item.id === device.id ? device : item))
      : [device, ...state.devices],
  };
}

function withoutAgent(state: PlatformState, agentId: string): PlatformState {
  return {
    ...state,
    agents: state.agents.filter((agent) => agent.id !== agentId),
    devices: state.devices.map((device) =>
      device.boundAgentId === agentId
        ? {
            ...device,
            boundAgentId: null,
            boundAgentName: null,
            boundConfigVersion: null,
            boundAt: null,
          }
        : device,
    ),
  };
}

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
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [platformError, setPlatformError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const platformStateKey = useMemo(
    () => platformStateQueryKey(authSession?.user.id),
    [authSession?.user.id],
  );

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

  const platformStateQuery = useQuery({
    enabled: Boolean(authSession) && !authLoading,
    queryFn: loadPlatformState,
    queryKey: platformStateKey,
  });

  const createAgentMutation = useMutation({ mutationFn: createPlatformAgent });
  const updateAgentMutation = useMutation({ mutationFn: updatePlatformAgent });
  const deleteAgentMutation = useMutation({ mutationFn: deletePlatformAgent });
  const createDeviceMutation = useMutation({ mutationFn: createPlatformDotDevice });
  const claimDeviceActivationMutation = useMutation({
    mutationFn: claimPlatformDeviceActivation,
  });
  const updateDeviceMutation = useMutation({ mutationFn: updatePlatformDotDevice });
  const deleteDeviceMutation = useMutation({ mutationFn: deletePlatformDotDevice });
  const updateUserSettingsMutation = useMutation({
    mutationFn: updatePlatformUserSettings,
  });
  const createApiKeyMutation = useMutation({ mutationFn: createPlatformApiKey });
  const revokeApiKeyMutation = useMutation({ mutationFn: revokePlatformApiKey });

  function reportPlatformError(error: unknown) {
    setPlatformError(error instanceof Error ? error.message : String(error));
  }

  function updatePlatformState(updater: (state: PlatformState) => PlatformState) {
    queryClient.setQueryData<PlatformState>(platformStateKey, (state) =>
      state ? updater(state) : state,
    );
  }

  useEffect(() => {
    function handlePopState() {
      setActivePage(pageFromPathname(window.location.pathname));
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (platformStateQuery.data) {
      setPlatformError(null);
    }
  }, [platformStateQuery.data]);

  const normalizedAgents = useMemo(
    () => (platformStateQuery.data?.agents ?? []).map(normalizeVoiceAgent),
    [platformStateQuery.data?.agents],
  );

  const devices = platformStateQuery.data?.devices ?? [];
  const userSettings = platformStateQuery.data?.userSettings ?? defaultUserSettings;
  const apiKeys = platformStateQuery.data?.apiKeys ?? [];
  const platformLoading = platformStateQuery.isLoading;
  const queryError =
    platformStateQuery.error instanceof Error
      ? platformStateQuery.error.message
      : platformStateQuery.error
        ? String(platformStateQuery.error)
        : null;
  const platformErrorMessage = platformError ?? queryError;

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
    setSelectedAgentId(null);
    setPlatformError(null);
    queryClient.removeQueries({ queryKey: ["platform-state"] });
    window.history.replaceState({}, "", "/login");
  }

  async function handleCreateAgent(input: CreateAgentInput) {
    try {
      const agent = await createAgentMutation.mutateAsync(input);
      updatePlatformState((state) => withAgent(state, agent));
      setSelectedAgentId(agent.id);
      setPlatformError(null);
    } catch (error) {
      reportPlatformError(error);
    }
  }

  function handleUpdateAgentIdentity(agentId: string, input: CreateAgentInput) {
    const agent = normalizedAgents.find((item) => item.id === agentId);

    if (!agent) {
      return;
    }

    const nextAgent = normalizeVoiceAgent({
      ...agent,
      ...input,
      updatedAt: new Date().toISOString(),
    });

    updatePlatformState((state) => withAgent(state, nextAgent));
    updateAgentMutation
      .mutateAsync(nextAgent)
      .then((savedAgent) => {
        updatePlatformState((state) => withAgent(state, savedAgent));
        setSelectedAgentId(savedAgent.id);
        setPlatformError(null);
      })
      .catch((error) => {
        reportPlatformError(error);
        void queryClient.invalidateQueries({ queryKey: platformStateKey });
      });
  }

  async function handleDeleteAgentIdentity(agentId: string) {
    updatePlatformState((state) => withoutAgent(state, agentId));
    if (selectedAgentId === agentId) {
      const nextAgent = normalizedAgents.find((agent) => agent.id !== agentId);
      setSelectedAgentId(nextAgent?.id ?? null);
    }

    try {
      await deleteAgentMutation.mutateAsync(agentId);
      setPlatformError(null);
    } catch (error) {
      reportPlatformError(error);
      void queryClient.invalidateQueries({ queryKey: platformStateKey });
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

    updatePlatformState((state) => withAgent(state, nextAgent));
    updateAgentMutation
      .mutateAsync(nextAgent)
      .then((savedAgent) => {
        updatePlatformState((state) => withAgent(state, savedAgent));
        setPlatformError(null);
      })
      .catch((error) => {
        reportPlatformError(error);
        void queryClient.invalidateQueries({ queryKey: platformStateKey });
      });
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

    updatePlatformState((state) => withAgent(state, nextAgent));
    updateAgentMutation
      .mutateAsync(nextAgent)
      .then((savedAgent) => {
        updatePlatformState((state) => withAgent(state, savedAgent));
        setPlatformError(null);
      })
      .catch((error) => {
        reportPlatformError(error);
        void queryClient.invalidateQueries({ queryKey: platformStateKey });
      });
  }

  function handleArchitectureChange(architecture: VoiceArchitecture) {
    if (!selectedAgent) {
      return;
    }

    const nextAgent = normalizeVoiceAgent({
      ...selectedAgent,
      architecture,
      updatedAt: new Date().toISOString(),
    });

    updatePlatformState((state) => withAgent(state, nextAgent));
    updateAgentMutation
      .mutateAsync(nextAgent)
      .then((savedAgent) => {
        updatePlatformState((state) => withAgent(state, savedAgent));
        setPlatformError(null);
      })
      .catch((error) => {
        reportPlatformError(error);
        void queryClient.invalidateQueries({ queryKey: platformStateKey });
      });
  }

  function handleRealtimeConfigChange(realtime: RealtimeVoiceAgentConfig) {
    if (!selectedAgent) {
      return;
    }

    const nextAgent = normalizeVoiceAgent({
      ...selectedAgent,
      realtime,
      updatedAt: new Date().toISOString(),
    });

    updatePlatformState((state) => withAgent(state, nextAgent));
    updateAgentMutation
      .mutateAsync(nextAgent)
      .then((savedAgent) => {
        updatePlatformState((state) => withAgent(state, savedAgent));
        setPlatformError(null);
      })
      .catch((error) => {
        reportPlatformError(error);
        void queryClient.invalidateQueries({ queryKey: platformStateKey });
      });
  }

  function handleUserSettingChange<Key extends keyof UserSettings>(
    key: Key,
    value: UserSettings[Key],
  ) {
    const nextSettings = {
      ...userSettings,
      [key]: value,
    };
    updatePlatformState((state) => ({
      ...state,
      userSettings: nextSettings,
    }));
    updateUserSettingsMutation
      .mutateAsync(nextSettings)
      .then((savedSettings) => {
        updatePlatformState((state) => ({
          ...state,
          userSettings: savedSettings,
        }));
        setPlatformError(null);
      })
      .catch((error) => {
        reportPlatformError(error);
        void queryClient.invalidateQueries({ queryKey: platformStateKey });
      });
  }

  async function handleCreateApiKey(name: string) {
    try {
      const apiKey = await createApiKeyMutation.mutateAsync(name);
      updatePlatformState((state) => ({
        ...state,
        apiKeys: [apiKey, ...state.apiKeys],
      }));
      setPlatformError(null);
    } catch (error) {
      reportPlatformError(error);
    }
  }

  function handleRevokeApiKey(keyId: string) {
    updatePlatformState((state) => ({
      ...state,
      apiKeys: state.apiKeys.map((key) =>
        key.id === keyId
          ? {
              ...key,
              status: "revoked",
            }
          : key,
      ),
    }));
    revokeApiKeyMutation
      .mutateAsync(keyId)
      .then((apiKey) => {
        if (!apiKey) {
          return;
        }

        updatePlatformState((state) => ({
          ...state,
          apiKeys: state.apiKeys.map((key) => (key.id === apiKey.id ? apiKey : key)),
        }));
        setPlatformError(null);
      })
      .catch((error) => {
        reportPlatformError(error);
        void queryClient.invalidateQueries({ queryKey: platformStateKey });
      });
  }

  async function handleCreateDevice(input: CreateDotDeviceInput) {
    try {
      const device = await createDeviceMutation.mutateAsync(input);
      updatePlatformState((state) => withDevice(state, device));
      setPlatformError(null);
      return device;
    } catch (error) {
      reportPlatformError(error);
      return null;
    }
  }

  async function handleClaimDeviceActivation(code: string) {
    try {
      const device = await claimDeviceActivationMutation.mutateAsync({ code });
      updatePlatformState((state) => withDevice(state, device));
      setPlatformError(null);
      return device;
    } catch (error) {
      reportPlatformError(error);
      return null;
    }
  }

  async function handleUpdateDevice(device: DotDevice) {
    updatePlatformState((state) => withDevice(state, device));

    try {
      const savedDevice = await updateDeviceMutation.mutateAsync(device);
      updatePlatformState((state) => withDevice(state, savedDevice));
      setPlatformError(null);
      return savedDevice;
    } catch (error) {
      reportPlatformError(error);
      void queryClient.invalidateQueries({ queryKey: platformStateKey });
      return null;
    }
  }

  async function handleRemoveDevice(deviceId: string) {
    updatePlatformState((state) => ({
      ...state,
      devices: state.devices.filter((device) => device.id !== deviceId),
    }));
    try {
      await deleteDeviceMutation.mutateAsync(deviceId);
      setPlatformError(null);
    } catch (error) {
      reportPlatformError(error);
      void queryClient.invalidateQueries({ queryKey: platformStateKey });
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
        {platformErrorMessage ? (
          <section className="platform-status-panel error" role="status">
            <AlertCircle size={18} />
            <span>{platformErrorMessage}</span>
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
            onDeleteAgent={handleDeleteAgentIdentity}
            onSelectAgent={setSelectedAgentId}
            onUpdateAgent={handleUpdateAgentIdentity}
          />
        ) : null}

        {!platformLoading && activePage === "configuration" ? (
          <ConfigurationPage
            agent={selectedAgent}
            agents={normalizedAgents}
            selectedAgentId={selectedAgentId}
            onArchitectureChange={handleArchitectureChange}
            onModelChange={handleModelChange}
            onRealtimeConfigChange={handleRealtimeConfigChange}
            onSelectAgent={setSelectedAgentId}
            onSettingChange={handleSettingChange}
          />
        ) : null}

        {!platformLoading && activePage === "browser-test" ? (
          <BrowserTestPage
            agent={selectedAgent}
            agents={normalizedAgents}
            selectedAgentId={selectedAgentId}
            onSelectAgent={setSelectedAgentId}
          />
        ) : null}

        {!platformLoading && activePage === "dot-device" ? (
          <DotDevicePage
            agents={normalizedAgents}
            devices={devices}
            selectedAgent={selectedAgent}
            selectedAgentId={selectedAgentId}
            onClaimDeviceActivation={handleClaimDeviceActivation}
            onCreateDevice={handleCreateDevice}
            onRemoveDevice={handleRemoveDevice}
            onSelectAgent={setSelectedAgentId}
            onUpdateDevice={handleUpdateDevice}
          />
        ) : null}

        {!platformLoading && activePage === "settings" ? (
          <SettingsPage
            agents={normalizedAgents}
            apiKeys={apiKeys}
            selectedAgentId={selectedAgentId}
            settings={userSettings}
            onCreateApiKey={handleCreateApiKey}
            onSelectAgent={setSelectedAgentId}
            onRevokeApiKey={handleRevokeApiKey}
            onSettingChange={handleUserSettingChange}
            onSignOut={handleSignOut}
          />
        ) : null}
      </div>
    </main>
  );
}
