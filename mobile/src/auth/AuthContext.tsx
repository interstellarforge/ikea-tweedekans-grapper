import * as Device from "expo-device";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { api, normalizeServerUrl, onUnauthorized, send } from "@/api/client.ts";
import { loadHapticsPreference } from "@/lib/haptics.ts";
import { readValue, removeValue, writeValue } from "@/lib/storage.ts";

type Session = { email: string };

type AuthState = {
  status: "loading" | "signedOut" | "signedIn";
  session: Session | undefined;
  signIn: (input: {
    email: string;
    password: string;
    serverUrl: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
};

type LoginResponse = { token: string; user: { email: string } };
type Profile = { email: string };

const AuthContext = createContext<AuthState | undefined>(undefined);

export function useAuth(): AuthState {
  const value = use(AuthContext);
  if (!value) throw new Error("useAuth needs an AuthProvider");
  return value;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [session, setSession] = useState<Session | undefined>(undefined);

  const clear = useCallback(async () => {
    await removeValue("token");
    setSession(undefined);
    setStatus("signedOut");
  }, []);

  useEffect(() => {
    onUnauthorized(() => {
      void clear();
    });
    void (async () => {
      await loadHapticsPreference();
      const token = await readValue("token");
      if (!token) {
        setStatus("signedOut");
        return;
      }
      try {
        const profile = await api<Profile>("/api/profile");
        setSession({ email: profile.email });
        setStatus("signedIn");
      } catch {
        // Offline at startup keeps the token; a real 401 already cleared it.
        setStatus((await readValue("token")) ? "signedIn" : "signedOut");
      }
    })();
  }, [clear]);

  const signIn: AuthState["signIn"] = useCallback(
    async ({ email, password, serverUrl }) => {
      const baseUrl = normalizeServerUrl(serverUrl);
      const result = await api<LoginResponse>("/api/mobile/login", {
        method: "POST",
        baseUrl,
        token: "",
        body: JSON.stringify({
          email,
          password,
          deviceName: Device.modelName ?? "Android",
        }),
      });
      await writeValue("serverUrl", baseUrl);
      await writeValue("token", result.token);
      setSession({ email: result.user.email });
      setStatus("signedIn");
    },
    [],
  );

  const signOut = useCallback(async () => {
    try {
      await send("/api/mobile/logout", "POST");
    } catch {
      /* the token may already be revoked; sign out locally regardless */
    }
    await clear();
  }, [clear]);

  const value = useMemo(
    () => ({ status, session, signIn, signOut }),
    [status, session, signIn, signOut],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}
