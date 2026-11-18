import { verifyFirebaseIdToken } from "@/lib/firebase/admin";
import { generateWithGemini } from "@/lib/narrative/gemini";
import { handleNarrativeRequest } from "@/lib/narrative/handler";
import { recordError } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A failed generation is answered with the deterministic fallback, so it is recorded here for the
// ScienceWerx monitoring dashboard before the handler turns it into a 502.
async function generate(systemPrompt: string, userPrompt: string) {
  try {
    return await generateWithGemini(systemPrompt, userPrompt);
  } catch (error) {
    recordError(error, { route: "POST /api/narrative" });
    throw error;
  }
}

export function POST(req: Request) {
  return handleNarrativeRequest(req, { verifyIdToken: verifyFirebaseIdToken, generate });
}
