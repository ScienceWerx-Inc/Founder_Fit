'use client';
import React, { useEffect, useState } from "react";
import type { PeersResponse } from "@/lib/connect/types";
import { useAuth } from "./AuthGate";
import { T } from "./theme";

const MONO = "var(--font-ibm-plex-mono), 'IBM Plex Mono', monospace";

const APP_NAMES: Record<string, string> = {
  istartup: "iStartup",
  prismscore: "Prism School",
  founderfit: "FounderFit",
  inkeep: "InkKeep",
  inkguard: "InkGuard",
};

const STATUS_COLORS: Record<string, string> = { VALID: T.accent, EXPIRED: T.amber, REVOKED: T.red };

function appName(app: string) {
  return APP_NAMES[app] ?? app;
}

/**
 * "Connected apps" (ScienceWerx Connect): what other ScienceWerx apps hold for this same verified
 * email. Renders nothing while loading, on any error, or when no peer has anything to show.
 */
export function ConnectedApps() {
  const { user } = useAuth();
  const [data, setData] = useState<PeersResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/connect/peers", { headers: { Authorization: `Bearer ${idToken}` }, cache: "no-store" });
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled && Array.isArray(body?.cards) && Array.isArray(body?.certificates)) setData(body);
      } catch {
        // Connected apps are optional; the page works without them.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!data || (data.cards.length === 0 && data.certificates.length === 0)) return null;

  return (
    <section aria-label="Connected apps" className="no-print" style={{ width: "100%", maxWidth: 1060, margin: "0 auto 40px", textAlign: "left" }}>
      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: T.mut, marginBottom: 12 }}>
        Connected apps
      </div>
      {data.cards.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 16 }}>
          {data.cards.map((c) => (
            <div key={c.app} style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10, padding: "18px 20px" }}>
              <div style={{ fontSize: 13, color: T.mut }}>{c.title}</div>
              <div style={{ fontSize: 18, fontWeight: 700, margin: "4px 0 10px" }}>{c.headline}</div>
              {c.lines.length > 0 && (
                <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 13.5 }}>
                  {c.lines.map((l, i) => (
                    <React.Fragment key={i}>
                      <dt style={{ color: T.mut }}>{l.label}</dt>
                      <dd style={{ margin: 0 }}>{l.value}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              )}
              <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 12, fontSize: 13.5, fontWeight: 600, color: T.accent }}>
                Open in {appName(c.app)}
              </a>
            </div>
          ))}
        </div>
      )}
      {data.certificates.length > 0 && (
        <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10, padding: "16px 20px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Your certificates</div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {data.certificates.map((c) => (
              <li key={`${c.app}:${c.code}`} style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", alignItems: "baseline", fontSize: 13.5 }}>
                <strong>{c.title}</strong>
                <span style={{ color: T.mut }}>{c.issuer}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: STATUS_COLORS[c.status] ?? T.mut }}>{c.status}</span>
                <a href={c.verifyUrl} target="_blank" rel="noopener noreferrer" style={{ color: T.accent }}>
                  Verify
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
