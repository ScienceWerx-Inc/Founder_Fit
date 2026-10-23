import { verifyFirebaseIdToken } from "@/lib/firebase/admin";
import { generateWithGemini } from "@/lib/narrative/gemini";
import { handleNarrativeRequest } from "@/lib/narrative/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return handleNarrativeRequest(req, { verifyIdToken: verifyFirebaseIdToken, generate: generateWithGemini });
}
