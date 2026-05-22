import { createClient, type Session } from "@supabase/supabase-js";
import {
  loadAuthSession,
  loginWithPassword,
  logoutFromApi,
  signupWithPassword,
} from "./platformApi";
import type { AuthCredentials, AuthSession } from "../types";

const LOCAL_AUTH_STORAGE_KEY = "opendot-auth-session-v1";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

let supabaseClient: ReturnType<typeof createClient> | null = null;

export function authProviderLabel() {
  return isSupabaseAuthConfigured() ? "Supabase Auth" : "OpenDot local auth";
}

export function isSupabaseAuthConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

function getSupabaseClient() {
  if (!isSupabaseAuthConfigured()) {
    return null;
  }

  supabaseClient ??= createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseClient;
}

function stringMetadata(value: unknown) {
  return typeof value === "string" ? value : "";
}

function sessionFromSupabase(session: Session): AuthSession {
  const metadata = session.user.user_metadata ?? {};
  const email = session.user.email ?? "";
  const displayName =
    stringMetadata(metadata.full_name) ||
    stringMetadata(metadata.name) ||
    email ||
    "OpenDot user";

  return {
    accessToken: session.access_token,
    user: {
      id: session.user.id,
      authProvider: "supabase",
      email,
      displayName,
      avatarUrl: stringMetadata(metadata.avatar_url) || null,
    },
  };
}

function readLocalSession() {
  try {
    const raw = window.localStorage.getItem(LOCAL_AUTH_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

function saveLocalSession(session: AuthSession) {
  window.localStorage.setItem(LOCAL_AUTH_STORAGE_KEY, JSON.stringify(session));
}

function clearLocalSession() {
  window.localStorage.removeItem(LOCAL_AUTH_STORAGE_KEY);
}

export async function getCurrentAuthSession(): Promise<AuthSession | null> {
  const supabase = getSupabaseClient();

  if (supabase) {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      throw new Error(error.message);
    }

    return data.session ? sessionFromSupabase(data.session) : null;
  }

  const localSession = readLocalSession();

  if (!localSession?.accessToken) {
    return null;
  }

  try {
    const { user } = await loadAuthSession(localSession.accessToken);
    return { ...localSession, user };
  } catch {
    clearLocalSession();
    return null;
  }
}

export async function signUp(input: AuthCredentials) {
  const supabase = getSupabaseClient();

  if (supabase) {
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          full_name: input.displayName,
        },
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data.session) {
      throw new Error(
        "Supabase did not return a session. Disable email confirmations for this preview or sign in after confirming the account.",
      );
    }

    return sessionFromSupabase(data.session);
  }

  const session = await signupWithPassword(input);
  saveLocalSession(session);
  return session;
}

export async function signIn(input: AuthCredentials) {
  const supabase = getSupabaseClient();

  if (supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data.session) {
      throw new Error("Supabase did not return a session.");
    }

    return sessionFromSupabase(data.session);
  }

  const session = await loginWithPassword(input);
  saveLocalSession(session);
  return session;
}

export async function signOut() {
  const supabase = getSupabaseClient();

  if (supabase) {
    await supabase.auth.signOut();
  } else {
    await logoutFromApi().catch(() => undefined);
    clearLocalSession();
  }
}
