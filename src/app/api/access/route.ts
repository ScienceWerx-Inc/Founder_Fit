import { handleAccessRequest } from "@/lib/access/handler";
import { accessPolicyFromEnv } from "@/lib/access/policy";
import { verifyFirebaseIdToken } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return handleAccessRequest(req, { verifyIdToken: verifyFirebaseIdToken, accessPolicy: accessPolicyFromEnv() });
}
