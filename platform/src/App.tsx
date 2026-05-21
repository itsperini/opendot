import { useEffect, useMemo, useState } from "react";
import { AudioLines, Bot, Cpu, Settings2 } from "lucide-react";
import { OpenDotLogo } from "./components/OpenDotLogo";
import { SidebarUserSettings } from "./components/SidebarUserSettings";
import {
  createDefaultPipeline,
  normalizeVoiceAgent,
  updateStageModel,
  updateStageSetting,
} from "./lib/pipeline";
import {
  createId,
  createUserApiKey,
  loadAgents,
  loadUserApiKeys,
  loadUserSettings,
  saveAgents,
  saveUserApiKeys,
  saveUserSettings,
} from "./lib/storage";
import { AgentStudioPage } from "./pages/AgentStudioPage";
import { BrowserTestPage } from "./pages/BrowserTestPage";
import { ConfigurationPage } from "./pages/ConfigurationPage";
import { DotDevicePage } from "./pages/DotDevicePage";
import { SettingsPage } from "./pages/SettingsPage";
import type {
  CreateAgentInput,
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

function pageFromPathname(pathname: string): PageId {
  const route = pageItems.find((item) => item.path === pathname);
  return route?.id ?? "agent-studio";
}

function createAgent(input: CreateAgentInput): VoiceAgent {
  const now = new Date().toISOString();

  return {
    id: createId(),
    name: input.name,
    description: input.description,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    pipeline: createDefaultPipeline(),
  };
}

export default function App() {
  const [activePage, setActivePage] = useState<PageId>(() =>
    pageFromPathname(window.location.pathname),
  );
  const [agents, setAgents] = useState<VoiceAgent[]>(() =>
    loadAgents().map(normalizeVoiceAgent),
  );
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(() => {
    const [firstAgent] = loadAgents().map(normalizeVoiceAgent);
    return firstAgent?.id ?? null;
  });
  const [userSettings, setUserSettings] = useState<UserSettings>(() =>
    loadUserSettings(),
  );
  const [apiKeys, setApiKeys] = useState<UserApiKey[]>(() => loadUserApiKeys());

  useEffect(() => {
    saveAgents(agents);
  }, [agents]);

  useEffect(() => {
    saveUserSettings(userSettings);
  }, [userSettings]);

  useEffect(() => {
    saveUserApiKeys(apiKeys);
  }, [apiKeys]);

  useEffect(() => {
    function handlePopState() {
      setActivePage(pageFromPathname(window.location.pathname));
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  function navigateToPage(pageId: PageId) {
    const nextPage = pageItems.find((item) => item.id === pageId) ?? pageItems[0];
    window.history.pushState({ pageId }, "", nextPage.path);
    setActivePage(nextPage.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCreateAgent(input: CreateAgentInput) {
    const agent = createAgent(input);
    setAgents((current) => [agent, ...current]);
    setSelectedAgentId(agent.id);
  }

  function handleSettingChange(
    stageId: PipelineStage["id"],
    key: string,
    value: StageSettingValue,
  ) {
    if (!selectedAgent) {
      return;
    }

    setAgents((current) =>
      current.map((agent) =>
        agent.id === selectedAgent.id
          ? {
              ...agent,
              updatedAt: new Date().toISOString(),
              pipeline: updateStageSetting(agent.pipeline, stageId, key, value),
            }
          : agent,
      ),
    );
  }

  function handleModelChange(stageId: PipelineStage["id"], model: string) {
    if (!selectedAgent) {
      return;
    }

    setAgents((current) =>
      current.map((agent) =>
        agent.id === selectedAgent.id
          ? {
              ...agent,
              updatedAt: new Date().toISOString(),
              pipeline: updateStageModel(agent.pipeline, stageId, model),
            }
          : agent,
      ),
    );
  }

  function handleUserSettingChange<Key extends keyof UserSettings>(
    key: Key,
    value: UserSettings[Key],
  ) {
    setUserSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleCreateApiKey(name: string) {
    setApiKeys((current) => [createUserApiKey(name), ...current]);
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
        {activePage === "agent-studio" ? (
          <AgentStudioPage
            agents={agents}
            selectedAgentId={selectedAgentId}
            onCreateAgent={handleCreateAgent}
            onSelectAgent={setSelectedAgentId}
          />
        ) : null}

        {activePage === "configuration" ? (
          <ConfigurationPage
            agent={selectedAgent}
            onModelChange={handleModelChange}
            onSettingChange={handleSettingChange}
          />
        ) : null}

        {activePage === "browser-test" ? <BrowserTestPage agent={selectedAgent} /> : null}

        {activePage === "dot-device" ? (
          <DotDevicePage agents={agents} selectedAgent={selectedAgent} />
        ) : null}

        {activePage === "settings" ? (
          <SettingsPage
            apiKeys={apiKeys}
            settings={userSettings}
            onCreateApiKey={handleCreateApiKey}
            onRevokeApiKey={handleRevokeApiKey}
            onSettingChange={handleUserSettingChange}
          />
        ) : null}
      </div>
    </main>
  );
}
