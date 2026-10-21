import { GoogleGenAI, ThinkingLevel } from "@google/genai";

// Gemini on Vertex AI via Application Default Credentials (no API key).
// Model and location are env-configurable so a retired model or a regional 404 can be fixed without a code change.
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
export const DEFAULT_GEMINI_LOCATION = "us-central1";

let client: GoogleGenAI | undefined;

function getClient(): GoogleGenAI {
  client ??= new GoogleGenAI({
    enterprise: true,
    project: process.env.GOOGLE_CLOUD_PROJECT ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    location: process.env.GOOGLE_CLOUD_LOCATION ?? DEFAULT_GEMINI_LOCATION,
  });
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
