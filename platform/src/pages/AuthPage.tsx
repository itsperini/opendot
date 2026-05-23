import { FormEvent, useMemo, useState } from "react";
import {
  ArrowRight,
  Chrome,
  Github,
  Loader2,
  LockKeyhole,
  Mail,
  RadioTower,
  UserRound,
} from "lucide-react";
import { OpenDotLogo } from "../components/OpenDotLogo";
import { authProviderLabel, isSupabaseAuthConfigured } from "../lib/authClient";
import type { AuthCredentials } from "../types";

type AuthPageMode = "login" | "signup";

type AuthPageProps = {
  error: string | null;
  loading: boolean;
  onSubmit: (mode: AuthPageMode, credentials: AuthCredentials) => Promise<void>;
};

export function AuthPage({ error, loading, onSubmit }: AuthPageProps) {
  const [mode, setMode] = useState<AuthPageMode>(() =>
    window.location.pathname === "/signup" ? "signup" : "login",
  );
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const provider = useMemo(() => authProviderLabel(), []);
  const supabaseConfigured = useMemo(() => isSupabaseAuthConfigured(), []);
  const isSignup = mode === "signup";

  function switchMode(nextMode: AuthPageMode) {
    setMode(nextMode);
    setPendingNotice(null);
    window.history.replaceState({}, "", nextMode === "signup" ? "/signup" : "/login");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingNotice(null);
    await onSubmit(mode, {
      displayName,
      email,
      password,
    });
  }

  return (
    <main className="auth-shell">
      <section className="auth-brand-panel" aria-labelledby="auth-brand-title">
        <a
          className="auth-brand"
          href="/login"
          onClick={(event) => event.preventDefault()}
        >
          <OpenDotLogo className="auth-brand-mark" title="OpenDot" />
          <span>OpenDot</span>
        </a>

        <div className="auth-brand-copy">
          <p className="eyebrow">Voice agent platform</p>
          <h1 id="auth-brand-title">Sign in to operate your agents and devices.</h1>
        </div>

        <div className="auth-signal-grid" aria-hidden="true">
          <span>VAD</span>
          <span>STT</span>
          <span>LLM</span>
          <span>TTS</span>
        </div>

        <div className="auth-runtime-strip">
          <RadioTower size={17} />
          <span>{provider}</span>
        </div>
      </section>

      <section className="auth-form-panel" aria-labelledby="auth-form-title">
        <div className="auth-form-heading">
          <p className="eyebrow">{supabaseConfigured ? "Supabase Auth" : "Local Auth"}</p>
          <h2 id="auth-form-title">{isSignup ? "Create account" : "Welcome back"}</h2>
        </div>

        <div className="auth-mode-tabs" role="tablist" aria-label="Authentication mode">
          <button
            aria-selected={!isSignup}
            className={!isSignup ? "active" : ""}
            type="button"
            onClick={() => switchMode("login")}
          >
            Login
          </button>
          <button
            aria-selected={isSignup}
            className={isSignup ? "active" : ""}
            type="button"
            onClick={() => switchMode("signup")}
          >
            Sign up
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {isSignup ? (
            <label>
              Name
              <span className="auth-input-shell">
                <UserRound size={17} />
                <input
                  autoComplete="name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Marco"
                />
              </span>
            </label>
          ) : null}

          <label>
            Email
            <span className="auth-input-shell">
              <Mail size={17} />
              <input
                autoComplete="email"
                inputMode="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                required
              />
            </span>
          </label>

          <label>
            Password
            <span className="auth-input-shell">
              <LockKeyhole size={17} />
              <input
                autoComplete={isSignup ? "new-password" : "current-password"}
                minLength={8}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="8 characters minimum"
                required
              />
            </span>
          </label>

          {error ? <p className="auth-error">{error}</p> : null}
          {pendingNotice ? <p className="auth-notice">{pendingNotice}</p> : null}

          <button className="primary-button auth-submit" type="submit" disabled={loading}>
            {loading ? <Loader2 size={17} /> : <ArrowRight size={17} />}
            {isSignup ? "Create account" : "Login"}
          </button>
        </form>

        <div className="auth-secondary-row">
          <button
            type="button"
            onClick={() =>
              setPendingNotice("Password reset is prepared in the UI and not wired yet.")
            }
          >
            Forgot password?
          </button>
        </div>

        <div className="oauth-buttons" aria-label="OAuth providers">
          <button type="button" disabled title="Google OAuth is not wired yet.">
            <Chrome size={16} />
            Google
          </button>
          <button type="button" disabled title="GitHub OAuth is not wired yet.">
            <Github size={16} />
            GitHub
          </button>
        </div>
      </section>
    </main>
  );
}
