import { accessPolicyFromEnv } from "@/lib/access/policy";
import { connectKeyFromEnv, parseConnectPeers } from "@/lib/connect/env";
import { handlePeersRequest } from "@/lib/connect/peers";
import { verifyFirebaseIdToken } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return handlePeersRequest(req, {
    verifyIdToken: verifyFirebaseIdToken,
    accessPolicy: accessPolicyFromEnv(),
    peers: parseConnectPeers(process.env.CONNECT_PEERS),
    key: connectKeyFromEnv(),
  });
}
