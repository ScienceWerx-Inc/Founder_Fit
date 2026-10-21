import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

// Bump together with assessmentFields() in firestore.rules whenever the doc shape changes.
export const ASSESSMENT_SCHEMA_VERSION = 1;
const MAX_CANDIDATE_NAME = 200; // matches firestore.rules
const MAX_NARRATIVE = 20000; // matches firestore.rules

export type NewAssessment = {
  candidateName: string;
  assetId: string;
  assetName: string;
  context: Record<string, string>;
  versions: Record<string, string>;
  // runScoring() output: { result, vdp }
  output: { result: { ffi: number; band: string; validity: { status: string } } } & Record<string, unknown>;
};

// Firestore rejects undefined values; a JSON round-trip drops them and turns NaN/Infinity into null,
// matching how reports were stored before (as a JSON.stringify'd string).
function toFirestoreData<V>(value: V): V {
  return JSON.parse(JSON.stringify(value));
}

/** Saves a scored assessment under users/{uid}/assessments and returns the new doc id. */
export async function createAssessment(db: Firestore, uid: string, a: NewAssessment): Promise<string> {
  const ref = await addDoc(collection(db, "users", uid, "assessments"), {
    ownerUid: uid,
    candidateName: (a.candidateName.trim() || "Anonymous Candidate").slice(0, MAX_CANDIDATE_NAME),
    assetId: a.assetId,
    assetName: a.assetName || "Unknown Asset",
    ffiScore: a.output.result.ffi,
    band: a.output.result.band,
    validityStatus: a.output.result.validity.status,
    versions: toFirestoreData(a.versions),
    context: toFirestoreData(a.context),
    report: toFirestoreData(a.output),
    narrative: null,
    schemaVersion: ASSESSMENT_SCHEMA_VERSION,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Attaches the generated narrative to a saved assessment (the only update the rules allow). */
export async function saveNarrative(db: Firestore, uid: string, assessmentId: string, narrative: string): Promise<void> {
  await updateDoc(doc(db, "users", uid, "assessments", assessmentId), {
    narrative: narrative.slice(0, MAX_NARRATIVE),
    updatedAt: serverTimestamp(),
  });
}
