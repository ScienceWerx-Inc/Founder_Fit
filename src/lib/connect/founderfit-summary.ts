// Builds FounderFit's Connect summary card from a person's latest stored assessment
// (users/{uid}/assessments/*, shape in firestore.rules and src/lib/assessments.ts).
// Pure apart from the injected lookups, so it is unit tested without Firebase.
//
// Minimum data: the score, band and a few labels. The narrative text and the raw report are never
// returned.

import type { Firestore } from "firebase-admin/firestore";
import type { ConnectCard, ConnectLine } from "./types";
import type { SummaryLookup } from "./provider";

// Same labels as BAND_LABELS in src/app/page.tsx (keep in sync).
export const BAND_LABELS: Record<string, string> = {
  anchor: "Anchor Founder",
  anchor_with_complement: "Anchor with Complement",
  technical_founder: "Technical Founder",
  contributor_advisor: "Contributor / Advisor",
  no_fit_anchor: "No Fit — Anchor Role",
};

const MAX_VALUE = 120;

/** Fields of a stored assessment the card reads; everything is optional because it comes from storage. */
export type StoredAssessment = {
  candidateName?: unknown;
  assetName?: unknown;
  ffiScore?: unknown;
  band?: unknown;
  validityStatus?: unknown;
  report?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type SubjectUser = { uid: string; email?: string; emailVerified: boolean };

export type FounderFitSummaryDeps = {
  /** null when no account has this email. */
  findUserByEmail: (email: string) => Promise<SubjectUser | null>;
  /** The user's most recently created assessment, or null when they have none. */
  latestAssessment: (uid: string) => Promise<StoredAssessment | null>;
  appUrl: string;
};

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > MAX_VALUE ? s.slice(0, MAX_VALUE - 1) + "…" : s;
}

function isoDate(value: unknown): string | null {
  if (value && typeof value === "object" && typeof (value as { toDate?: unknown }).toDate === "function") {
    value = (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === "string" || typeof value === "number") value = new Date(value);
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : null;
}

type Dimension = { label?: unknown; percentile?: unknown; weight?: unknown };
type Gap = { label?: unknown; shortfall?: unknown };

function result(report: unknown): Record<string, unknown> | null {
  const r = report && typeof report === "object" ? (report as { result?: unknown }).result : null;
  return r && typeof r === "object" ? (r as Record<string, unknown>) : null;
}

/** Same rule as "Talents against this asset" on the results page: most weighted dimension above median. */
function strongestArea(r: Record<string, unknown> | null): string | null {
  const dims = Array.isArray(r?.dimensions) ? (r!.dimensions as Dimension[]) : [];
  let best: { label: string; score: number } | null = null;
  for (const d of dims) {
    if (typeof d?.percentile !== "number" || d.percentile < 55) continue;
    const label = text(d.label);
    if (!label) continue;
    const score = (typeof d.weight === "number" ? d.weight : 0) * (d.percentile - 50);
    if (!best || score > best.score) best = { label, score };
  }
  return best?.label ?? null;
}

function biggestGap(r: Record<string, unknown> | null): string | null {
  const gaps = Array.isArray(r?.gaps) ? (r!.gaps as Gap[]) : [];
  let best: { label: string; shortfall: number } | null = null;
  for (const g of gaps) {
    const label = text(g?.label);
    const shortfall = typeof g?.shortfall === "number" ? g.shortfall : 0;
    if (label && (!best || shortfall > best.shortfall)) best = { label, shortfall };
  }
  return best?.label ?? null;
}

/** null when the doc lacks a usable score (then the person is reported as found:false). */
export function buildFounderFitCard(a: StoredAssessment, appUrl: string): ConnectCard | null {
  if (typeof a.ffiScore !== "number" || !Number.isFinite(a.ffiScore)) return null;
  const updatedAt = isoDate(a.updatedAt) ?? isoDate(a.createdAt);
  if (!updatedAt) return null;
  const band = typeof a.band === "string" ? BAND_LABELS[a.band] ?? text(a.band) : null;
  let headline = `${Math.round(a.ffiScore)} / 100 FFI`;
  if (band) headline += ` · ${band}`;
  if (typeof a.validityStatus === "string" && a.validityStatus !== "clean") headline += ` · validity ${a.validityStatus}`;

  const r = result(a.report);
  const fitPattern = r?.fit_pattern && typeof r.fit_pattern === "object" ? text((r.fit_pattern as { label?: unknown }).label) : null;
  const candidates: [string, string | null][] = [
    ["Venture", text(a.assetName)],
    // No candidate name: an assessment can be about someone other than the
    // account owner, and their name must not travel to another app.
    ["Strongest area", strongestArea(r)],
    ["Biggest gap", biggestGap(r)],
    ["Fit pattern", fitPattern],
  ];
  const lines: ConnectLine[] = candidates
    .filter((c): c is [string, string] => c[1] !== null)
    .slice(0, 5)
    .map(([label, value]) => ({ label, value }));

  return { title: "FounderFit assessment", headline, lines, url: appUrl, updatedAt };
}

/** The most recently created assessment under users/{uid}/assessments (single-field order, no composite index). */
export async function latestAssessment(db: Firestore, uid: string): Promise<StoredAssessment | null> {
  const snap = await db.collection("users").doc(uid).collection("assessments").orderBy("createdAt", "desc").limit(1).get();
  return snap.empty ? null : (snap.docs[0].data() as StoredAssessment);
}

export function founderFitSummaryLookup(deps: FounderFitSummaryDeps): SummaryLookup {
  return async (email) => {
    const user = await deps.findUserByEmail(email);
    // Only a verified address identifies the person; an unverified account with this email might
    // belong to someone else.
    if (!user || user.emailVerified !== true) return { found: false };
    if (user.email && user.email.toLowerCase() !== email) return { found: false };
    const assessment = await deps.latestAssessment(user.uid);
    if (!assessment) return { found: false };
    const card = buildFounderFitCard(assessment, deps.appUrl);
    return card ? { found: true, card } : { found: false };
  };
}
