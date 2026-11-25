// ScienceWerx Connect v1 wire types (shared by every ScienceWerx app; see README "ScienceWerx Connect").

export type ConnectScope = "summary" | "certificates";

export type ConnectLine = { label: string; value: string };

export type ConnectCard = {
  title: string;
  headline: string;
  /** At most 5, plain text, values at most 120 chars. */
  lines: ConnectLine[];
  /** A page in the provider app the person can open (they sign in there with their own account). */
  url: string;
  updatedAt: string;
};

export type ConnectSummaryResponse =
  | { app: string; found: false }
  | { app: string; found: true; card: ConnectCard };

export type CertificateStatus = "VALID" | "EXPIRED" | "REVOKED";

export type ConnectCertificate = {
  code: string;
  title: string;
  issuer: string;
  issuedAt: string | null;
  expiresAt: string | null;
  status: CertificateStatus;
  verifyUrl: string;
};

/** What /api/connect/peers returns to the browser: each item tagged with the peer it came from. */
export type PeerCard = ConnectCard & { app: string };
export type PeerCertificate = ConnectCertificate & { app: string };
export type PeersResponse = { cards: PeerCard[]; certificates: PeerCertificate[] };
