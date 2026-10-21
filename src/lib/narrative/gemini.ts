import { GoogleGenAI, ThinkingLevel } from "@google/genai";

// Two backends through the same SDK:
// - GEMINI_API_KEY set (local dev only, in .env.local): Gemini Developer API with that key.
// - otherwise (always in production): Vertex AI via Application Default Credentials, no API key.
// Model and location are env-configurable so a retired model or a regional 404 can be fixed without a code change.
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
export const DEFAULT_GEMINI_LOCATION = "us-central1";

export type GeminiBackend = "developer-api" | "vertex-ai";

let client: GoogleGenAI | undefined;

// The SDK also reads GEMINI_API_KEY/GOOGLE_API_KEY from the environment on its own, so the backend is chosen
// here explicitly: Vertex gets an explicit project/location (which makes the SDK ignore any env key).
export function geminiBackend(): GeminiBackend {
  return process.env.GEMINI_API_KEY && process.env.NODE_ENV !== "production" ? "developer-api" : "vertex-ai";
}

function getClient(): GoogleGenAI {
  if (client) return client;
  if (geminiBackend() === "developer-api") {
    client = new GoogleGenAI({ enterprise: false, apiKey: process.env.GEMINI_API_KEY });
  } else {
    if (process.env.GEMINI_API_KEY) console.warn("GEMINI_API_KEY is ignored in production; using Vertex AI.");
    client = new GoogleGenAI({
      enterprise: true,
      project: process.env.GOOGLE_CLOUD_PROJECT ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      location: process.env.GOOGLE_CLOUD_LOCATION ?? DEFAULT_GEMINI_LOCATION,
    });
  }
  return client;
}

export async function generateWithGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await getClient().models.generateContent({
    model: process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      // Gemini 3.x ignores temperature/topP/topK and can't turn thinking off; thinking tokens count
      // toward this limit, so leave room above the ~1k-token narrative.
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });
  return response.text ?? "";
}
