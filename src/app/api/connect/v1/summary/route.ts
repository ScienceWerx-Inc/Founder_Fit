import { parseConnectCallers, founderFitPublicUrl } from "@/lib/connect/env";
import { founderFitSummaryLookup, latestAssessment } from "@/lib/connect/founderfit-summary";
import { handleSummaryRequest } from "@/lib/connect/provider";
import { adminFirestore, findUserByEmail } from "@/lib/firebase/admin";
import { recordError } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const lookup = founderFitSummaryLookup({
  findUserByEmail,
  latestAssessment: (uid) => latestAssessment(adminFirestore(), uid),
  appUrl: founderFitPublicUrl(),
});

export function GET(req: Request) {
  return handleSummaryRequest(req, {
    callers: parseConnectCallers(process.env.CONNECT_CALLERS),
    lookup: async (email) => {
      try {
        return await lookup(email);
      } catch (error) {
        recordError(error, { route: "GET /api/connect/v1/summary" });
        throw error;
      }
    },
  });
}
