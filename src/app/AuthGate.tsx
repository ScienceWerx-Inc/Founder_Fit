'use client';
import React, { createContext, useContext, useEffect, useState } from "react";
import { FirebaseError } from "firebase/app";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { T } from "./theme";

type AuthContextValue = { user: User; signOut: () => Promise<void> };

const AuthContext = createContext<AuthContextValue | null>(null);

// Only usable inside <AuthGate>, where a signed-in user is guaranteed.
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthGate>");
  return value;
}

const SANS = "var(--font-ibm-plex-sans), 'IBM Plex Sans', sans-serif";
const MONO = "var(--font-ibm-plex-mono), 'IBM Plex Mono', monospace";

function signInErrorMessage(error: unknown): string {
  const code = error instanceof FirebaseError ? error.code : "";
  switch (code) {
    case "auth/popup-blocked":
      return "Your browser blocked the Google sign-in popup. Allow popups for this site, then try again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "The sign-in window was closed before sign-in finished. Try again when you're ready.";
    case "auth/unauthorized-domain":
      return "This site isn't authorized for sign-in yet. Add its domain under Firebase Console → Authentication → Settings → Authorized domains.";
    case "auth/network-request-failed":
      return "Couldn't reach Google sign-in. Check your connection and try again.";
    default:
      return `Sign-in failed${code ? ` (${code})` : ""}. Please try again.`;
  }
}

function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#1C2321" />
        <path d="M10 22V10L16 16L22 10V22" stroke="#F5F6F2" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="16" cy="8" r="2" fill="#C55233" />
      </svg>
      <span style={{ fontWeight: 800, fontSize: 24, letterSpacing: "-0.02em", color: T.ink }}>
        FounderFit<span style={{ fontSize: 12, verticalAlign: "super", color: T.mut, marginLeft: 2 }}>™</span>
      </span>
    </div>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: T.paper, color: T.ink, fontFamily: SANS, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      {children}
    </div>
  );
}

function SignInScreen() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setPending(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
    } catch (e) {
      setError(signInErrorMessage(e));
      setPending(false);
    }
  };

  return (
    <Screen>
      <div style={{ width: "100%", maxWidth: 420, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10, padding: "36px 32px", display: "flex", flexDirection: "column", alignItems: "center", gap: 20, textAlign: "center" }}>
        <Logo />
        <p style={{ fontSize: 15, lineHeight: 1.6, color: T.mut, margin: 0 }}>
          Evaluate whether a candidate is the right founder for a specific technology asset.
        </p>
        <button
          onClick={handleSignIn}
          disabled={pending}
          style={{ width: "100%", fontFamily: SANS, fontWeight: 600, fontSize: 15, padding: "12px 22px", borderRadius: 6, border: `1px solid ${T.ink}`, background: T.ink, color: "#fff", cursor: pending ? "not-allowed" : "pointer", opacity: pending ? 0.6 : 1 }}
        >
          {pending ? "Signing in…" : "Sign in with Google"}
        </button>
        {error && (
          <p role="alert" style={{ fontSize: 13, lineHeight: 1.5, color: T.red, background: T.redSoft, borderRadius: 6, padding: "10px 12px", margin: 0, width: "100%" }}>
            {error}
          </p>
        )}
        <span style={{ fontFamily: MONO, fontSize: 11, color: T.mut }}>ScienceWerx</span>
      </div>
    </Screen>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setLoading(false);
      }),
    []
  );

  if (loading) {
    return (
      <Screen>
        <span style={{ fontFamily: MONO, fontSize: 12, color: T.mut }}>Loading…</span>
      </Screen>
    );
  }
  if (!user) return <SignInScreen />;

  return <AuthContext.Provider value={{ user, signOut: () => signOut(auth) }}>{children}</AuthContext.Provider>;
}
