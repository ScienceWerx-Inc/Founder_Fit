# FounderFit → Firebase: تقرير الـ Migration

> اتعمل بـ read-only analysis بتاريخ 2026-10-21 على commit `681af3e`.
> Firebase Project ID: **`founder-fit-6a455`**. الـ regions: App Hosting في **`us-east4`** (الـ backend `founder-fit` اللي كان موجود)، و Vertex AI في **`us-central1`**، و Firestore في **`nam5`** (US multi-region).

## 1. Executive summary
- الأبلكيشن دلوقتي عبارة عن صفحة Next.js 14.2.35 واحدة (`src/app/page.tsx` فيها 1325 سطر، `'use client'`). الـ scoring كله شغال في الـ browser. الحفظ بيحصل من خلال server action بتستخدم Prisma 7 على SQLite.
- مفيش login خالص، وأي حد يقدر ينده الـ server action ويكتب في الـ DB.
- الـ AI narrative بينده `api.anthropic.com` من الـ browser من غير API key، فهو **دايماً بيفشل** وبيرجع للـ fallback.
- الـ Prisma setup نفسه غالباً مكسور: Prisma 7 من غير driver adapter، والـ config file اسمه غلط. يعني الحفظ غالباً مش شغال أصلاً.
- المطلوب:
  - Firestore (client SDK + security rules)
  - Google sign-in gate
  - API route على السيرفر للـ narrative بـ **Gemini على Vertex AI** (من غير API key، بالـ service account)، والـ narrative يتحفظ في Firestore
  - `apphosting.yaml`
  - تنضيف: Vercel analytics، و Prisma، و agent skills، وسكريبتات الـ py، و `.env`/`dev.db`
- الأخبار الحلوة: `.env` و `dev.db` مفيهمش أي سر (`dev.db` فاضي، 0 rows)، فمش محتاجين history rewrite.
- المجهود التقريبي:
  - Phase 1 (الـ migration لحد أول deploy ناجح): **2–4 أيام** لواحد developer.
  - Phase 2 (صفحة "My assessments"): ~1 يوم.
  - تصليح الـ TS وتقسيم `page.tsx`: L لوحدهم.

## 2. Current state
**Stack والـ versions** (من `package.json`):
| حاجة | Version |
|---|---|
| next | 14.2.35 (App Router) |
| react / react-dom | ^18 |
| @vercel/analytics | ^2.0.1 |
| prisma / @prisma/client | ^7.10.0 (**في devDependencies**) |
| tailwindcss | ^3.4.1 |
| typescript | ^5 |
| Node محلياً | v22.12.0، npm 11.4.0 |
| `engines` | مش موجود |

**الـ data flow:**
1. `FounderFitAssessment()` في `page.tsx:852`: كل الـ state `useState` في الـ component (السطور 853–873). مفيش persistence في الـ browser ولا context.
2. الـ steps: `intro → asset → context → fc → scen → calib → adjacency → results`. فيه timer 60 ثانية لكل سؤال (`page.tsx:872`، `913–923`).
3. الـ context form (`CONTEXT_ITEMS` K1–K10، `page.tsx:291-302`) بيتحفظ في `context` state (`page.tsx:857`)، بس **مش بيدخل في الـ scoring ومش بيتحفظ**.
4. `finish()` في `page.tsx:938` بتبني `assessment` و `attestations`، وبعدين `runScoring()` (`page.tsx:703`) اللي بترجع `{ result, vdp }`.
5. `page.tsx:956` فيها `saveAssessment(candidateName, asset.name, out.result.ffi, out.result.band, out)`. دي fire-and-forget، والنتيجة بتتعمل `console.log` بس.
6. `src/app/actions.ts:10-26` بتعمل `prisma.assessment.create` وبتحط `report: JSON.stringify(outputData)`.
7. الـ narrative بيتولّد بزرار (`generateNarrative` في `page.tsx:982`)، و **ما بيتحفظش**.

**Prisma state:**
- `prisma/schema.prisma` فيه model واحد `Assessment` (id Int autoincrement، candidateName، assetName، ffiScore Int، band، report String، createdAt).
- `prisma7.config.ts`: **تصحيح بعد خطوة 0:** الـ CLI لقاه فعلاً (`npm ci` طبع "Loaded Prisma config from prisma7.config.ts")، و `prisma generate` نجح.
- `actions.ts:7` فيها `new PrismaClient()` من غير adapter. Prisma 7 بيطلب driver adapter (حسب `.agents/skills/prisma-upgrade-v7/SKILL.md`)، فالحفظ غالباً بيفشل runtime.
- `dev.db`: فيه جدول `Assessment` و **0 rows** (اتأكدت منه بـ sqlite read-only).

**Build state (خطوة 0، اتشغّل فعلاً بـ Node v22.12.0):**
- `npm ci`: نجح، 540 package. فيه `17 vulnerabilities (2 moderate, 14 high, 1 critical)` حسب `npm audit`، ولسه ما اتراجعتش.
- `npm run build`: **نجح (exit 0)**، والـ output "Skipping validation of types" و "Skipping linting" بسبب `next.config.mjs:3-8`. الـ route `/` static، حجمه 26.8 kB، و First Load 114 kB.
- `npx tsc --noEmit`: **214 TS error** مستخبيين. أغلبهم implicit any: TS7006 (80)، و TS7053 (55)، و TS7031 (17)، و TS18046 (15)، و TS18048 (13).
- `git status` بعد الـ install والـ build: مفيش tracked file اتغيّر.

**الفولدرات `.claude` و `.agents` و `.windsurf`:**
- `.agents/skills/*`: Prisma agent skills رسمية متسطّبة من `prisma/skills` (`skills-lock.json`).
- `.claude/skills/*` و `.windsurf/skills/*`: symlinks لـ `../../.agents/skills/<name>`. على Windows بتظهر كـ text files صغيرة لأن `core.symlinks=false`.
- مش code بتاع الأبلكيشن، و **هتتمسح مع شيل Prisma** (خطوة 8).

## 3. Gap analysis
| Area | What exists now | What's needed for Firebase | Effort |
|---|---|---|---|
| Database | Prisma 7 + SQLite، والـ setup غالباً مكسور | Firestore Standard edition في `nam5`، و `users/{uid}/assessments` بالـ client SDK (فيها `context` و `narrative`)، وشيل Prisma كله | M |
| Auth | مفيش | Firebase Auth بـ Google (`signInWithPopup`)، و `AuthGate`، وزرار sign-out | M |
| Hosting/Build | Vercel (ضمني) | `apphosting.yaml`، و `engines.node: 22`، و backend `founder-fit` في `us-east4` مربوط بـ GitHub، و Blaze plan | S |
| Env vars & secrets | `.env` committed، ومفيش secrets | `NEXT_PUBLIC_FIREBASE_*` (public)، و `GOOGLE_CLOUD_LOCATION`/`GEMINI_MODEL` (مش أسرار)، و `.env.local` (gitignored). **مفيش secrets** (Vertex AI بالـ ADC) | S |
| Security | server action مفتوحة لأي حد، ومفيش rules | `firestore.rules` owner-only مع `hasOnly`، و ID token verification في الـ narrative route، و cost guard | M |
| AI narrative call | `fetch` من الـ browser من غير key (`page.tsx:1043`) | API route على السيرفر + `@google/genai` (Vertex AI، `gemini-3.5-flash`) + verify ID token + حفظ في Firestore | M |
| Analytics | `@vercel/analytics` (`layout.tsx:2,31`) | تتشال، ومفيش بديل دلوقتي | S |
| Code quality/build health | `ignoreBuildErrors` و `ignoreDuringBuilds`، و `page.tsx` 1325 سطر، و 10 سكريبتات py، والـ autofill ظاهر في production | تتمسح السكريبتات، والـ autofill dev-only. بعدين (منفصل) نشيل الـ ignore ونصلّح الـ TS ونقسم الملف | L |
| Docs | README بيتكلم عن Vercel + Prisma (`README.md:10-16,38-46,56-65`) | README جديد: Firebase setup، و env vars، و deploy | S |

## 4. Database plan
**الـ structure:** subcollection `users/{uid}/assessments/{assessmentId}`. الـ ID بيتعمل auto بـ `addDoc`.
ليه subcollection؟ عشان الـ rule تبقى بسيطة (`uid` جزء من الـ path)، والـ listing بتاع صفحة "My assessments" (Phase 2) يبقى query بسيط من غير composite index. هنحط `ownerUid` في الـ doc كمان.

**Database:** ✅ اتعملت 2026-10-21: الـ `(default)` database، **Standard edition**، **Native mode**، location **`nam5`** (US multi-region). اتأكدت منها بـ `firebase firestore:databases:get "(default)" --project founder-fit-6a455`. الخطة الأولى كانت `us-central1` regional، بس الـ Owner اختار `nam5` وهنسيبها كده: الـ App Hosting backend (`us-east4`) و `nam5` الاتنين في أمريكا، فالـ latency بينهم صغيرة، والـ multi-region بيدّي availability أعلى (بسعر أعلى شوية من الـ regional). الـ location مينفعش تتغيّر.

| Field | Type | ملاحظة |
|---|---|---|
| `ownerUid` | string | لازم = `request.auth.uid` |
| `candidateName` | string | default "Anonymous Candidate"، وده **PII** |
| `assetId` | string | `assetId` state (`page.tsx:854`) |
| `assetName` | string | |
| `ffiScore` | int (0–100) | `out.result.ffi` |
| `band` | string | واحد من الـ 5 في `CONSTANTS.BANDS` (`page.tsx:18-24`) |
| `validityStatus` | string | `clean` أو `flagged` أو `void` |
| `versions` | map | `{algo_version, content_version, norms_version}` (`page.tsx:390`) |
| `context` | map<string,string> | **جديد**: إجابات الـ context form، keys من `K1` لـ `K10` (`page.tsx:291-302`) |
| `report` | map | الـ `out` كامل بعد الـ sanitize (تحت) |
| `narrative` | string \| null | `null` وقت الـ create، ويتحدّث لما الـ narrative يتولّد |
| `schemaVersion` | int | `1` |
| `createdAt` / `updatedAt` | timestamp | `serverTimestamp()` |

**تخزين `report` بأمان** (حسب https://firebase.google.com/docs/firestore/quotas و https://firebase.google.com/docs/firestore/manage-data/data-types):
- **`undefined`:** الـ SDK بيرفض undefined بـ error. والـ output فيه undefined فعلاً:
  - `waiver_note: waived ? ... : void 0` (`page.tsx:639`)
  - `hybrid_with` (`page.tsx:599`)
  - `dimension` و `threshold` في الـ gates
  - `attestations.ip_conflict_reviewed` (`page.tsx:946`)

  الحل: `JSON.parse(JSON.stringify(out))` قبل الكتابة. ده نفس سلوك الحفظ الحالي، بيشيل الـ undefined وبيحوّل NaN/Infinity لـ null. ونفس الـ sanitize على `context`.
- **Nested arrays:** في Standard edition "an array cannot contain another array value". راجعت الـ output: كل الـ arrays (`dimensions`، `gates`، `gaps[].routes`، `risk_flags[].evidence`، `validity.checks`، `vdp.active_gates`) هي arrays of maps أو arrays of strings، ومفيش array جوه array مباشرة. يعني **آمن**. أي تعديل مستقبلي في الـ scoring لازم يحافظ على ده.
- **Depth:** الحد 20 level، والـ output ≈ 3–4.
- **الحجم:** الحد 1 MiB. الـ report تقديراً عشرات الـ KB، والـ `narrative` (~700 كلمة ≈ 5 KB) والـ `context` (10 strings) مش هيفرقوا.
- **Index entries:** الحد 40,000 لكل doc. هنعمل **single-field index exemption على `report`** في `firestore.indexes.json` (`fieldOverrides`) عشان نوفّر write cost.

**Client SDK ولا Admin SDK؟ رأيي: Client SDK + rules.**
- الـ scoring أصلاً بيتحسب في الـ browser، فالسيرفر مش هيضيف ثقة في الأرقام. الـ rules بتضمن إن كل user يكتب في بياناته هو بس.
- مش محتاجين service account ولا ID-token plumbing للـ save.
- الـ Admin SDK بيعدّي الـ rules، فلو استخدمناه للـ save لازم `verifyIdToken` يدوي، وأي غلطة تبقى ثغرة.
- الـ Admin SDK هنستخدمه بس في `verifyIdToken` جوه الـ narrative route (قسم 7). وحفظ الـ narrative نفسه هيبقى من الـ client بـ `updateDoc`، والـ rules بتقيّده.

**Draft `firestore.rules`** (فيها `hasOnly` عشان محدش يكتب fields زيادة):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() { return request.auth != null; }
    function isOwner(uid) { return signedIn() && request.auth.uid == uid; }

    function assessmentFields() {
      return ['ownerUid','candidateName','assetId','assetName','ffiScore','band',
              'validityStatus','versions','context','report','narrative',
              'schemaVersion','createdAt','updatedAt'];
    }
    function contextKeys() {
      return ['K1','K2','K3','K4','K5','K6','K7','K8','K9','K10'];
    }

    match /users/{uid}/assessments/{assessmentId} {
      allow read, delete: if isOwner(uid);

      allow create: if isOwner(uid)
        && request.resource.data.keys().hasAll(assessmentFields())
        && request.resource.data.keys().hasOnly(assessmentFields())
        && request.resource.data.ownerUid == uid
        && request.resource.data.candidateName is string
        && request.resource.data.candidateName.size() <= 200
        && request.resource.data.assetId is string
        && request.resource.data.assetName is string
        && request.resource.data.ffiScore is int
        && request.resource.data.ffiScore >= 0 && request.resource.data.ffiScore <= 100
        && request.resource.data.band in
             ['anchor','anchor_with_complement','technical_founder','contributor_advisor','no_fit_anchor']
        && request.resource.data.validityStatus in ['clean','flagged','void']
        && request.resource.data.versions is map
        && request.resource.data.context is map
        && request.resource.data.context.keys().hasOnly(contextKeys())
        && request.resource.data.report is map
        && request.resource.data.narrative == null
        && request.resource.data.schemaVersion == 1
        && request.resource.data.createdAt == request.time
        && request.resource.data.updatedAt == request.time;

      // update: مسموح بس للـ narrative و updatedAt
      allow update: if isOwner(uid)
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['narrative','updatedAt'])
        && request.resource.data.narrative is string
        && request.resource.data.narrative.size() <= 20000
        && request.resource.data.updatedAt == request.time;
    }

    // أي حاجة تانية مقفولة
    match /{document=**} { allow read, write: if false; }
  }
}
```
مرجع: https://firebase.google.com/docs/firestore/security/rules-conditions.

ملاحظات:
- `hasAll` + `hasOnly` على نفس الـ list معناهم إن الـ keys لازم تبقى **بالظبط** الـ list دي، لا زيادة ولا ناقص.
- الـ `ffiScore` لازم يتبعت كـ integer. `Math.round` موجودة أصلاً (`page.tsx:667`).
- لو الـ schema اتغيّر بعدين، لازم `assessmentFields()` و `schemaVersion` يتحدّثوا مع بعض.
- كل ده هيتختبر في الـ Rules Playground أو الـ emulator.

**الـ code بتاع الحفظ (بدل `page.tsx:955-962`):**
```ts
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
const report = JSON.parse(JSON.stringify(out));
const ref = await addDoc(collection(db, "users", user.uid, "assessments"), {
  ownerUid: user.uid,
  candidateName: candidateName || "Anonymous Candidate",
  assetId, assetName: asset.name,
  ffiScore: out.result.ffi, band: out.result.band,
  validityStatus: out.result.validity.status,
  versions: VERSIONS,
  context: JSON.parse(JSON.stringify(context)),
  report, narrative: null, schemaVersion: 1,
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
});
setSavedId(ref.id); // عشان نحفظ الـ narrative في نفس الـ doc بعدين
```
**Re-score (قرار):** "Adjust adjacency & re-score" بيرجّع لـ `finish()`، و **كل مرة بتعمل doc جديد** زي السلوك الحالي مع Prisma. كده الـ history بيتحفظ، والـ rules بتفضل strict. صفحة "My assessments" هتعرضهم كلهم.

## 5. Auth plan
- **`src/lib/firebase/client.ts`:** `initializeApp` بـ config صريح من `NEXT_PUBLIC_FIREBASE_*`، مع guard `getApps().length ? getApp() : initializeApp(cfg)`. وبعدين `getAuth` و `getFirestore`.
  - ليه config صريح؟ لأن `initializeApp()` من غير arguments بيعتمد على `FIREBASE_WEBAPP_CONFIG` اللي موجود بس وقت الـ build جوه App Hosting (https://firebase.google.com/docs/app-hosting/firebase-sdks). الـ config الصريح شغال محلياً وفي App Hosting.
- **`src/app/AuthGate.tsx` (`'use client'`):** بيعمل `onAuthStateChanged` ويحط `user` و `loading` في state.
  - `loading` → شاشة "Loading…"
  - مفيش user → كارت فيه زرار "Sign in with Google" (`signInWithPopup(auth, new GoogleAuthProvider())`)
  - فيه user → يعرض `children`
  - وبيعمل expose لـ `user` و `signOut` من خلال React context (`useAuth()`).
- **ليه popup مش redirect؟** `authDomain` هيبقى `founder-fit-6a455.firebaseapp.com` والأبلكيشن على `*.hosted.app`، يعني domains مختلفة. الـ redirect flow بيبوظ في browsers كتير في الحالة دي، والـ popup هو Option 2 في https://firebase.google.com/docs/auth/web/redirect-best-practices. ومفيش custom domain دلوقتي.
- **مكان الـ gate:** `page.tsx:1323-1325`، يبقى `<AuthGate><FounderFitAssessment /></AuthGate>`.
- **Sign-out:** زرار في الـ header جوه `shell()` (`page.tsx:1078`) جنب "← Back"، يعرض `user.email` + "Sign out". لازم `className="no-print"`.
- **ربط الـ uid:** `finish()` (`page.tsx:938`) هتاخد `user` من `useAuth()`، والـ path `users/{uid}/...`، والـ rules بتتأكد منه.
- **Console:**
  - Authentication → Sign-in method → Google → Enable + support email.
  - Settings → Authorized domains: `localhost` و `founder-fit-6a455.firebaseapp.com` و `founder-fit-6a455.web.app` موجودين default. **لازم تضيف `founder-fit--founder-fit-6a455.us-east4.hosted.app`** (دومين الـ backend؛ مش موجود في الـ list لحد 2026-10-22).
  - مرجع: https://firebase.google.com/docs/auth/web/google-signin

**زرار "auto-fill sample" (dev-only):**
- فيه مكانين: زرار "auto-fill sample →" في الـ header (`page.tsx:1078`)، وزرار "Run sample candidate" في صفحة الـ intro (`page.tsx:1113` تقريباً).
- الاتنين يتلفّوا بـ `const SHOW_DEV_TOOLS = process.env.NODE_ENV !== "production";`. Next.js بيحط القيمة دي وقت الـ build، فهيبانوا مع `npm run dev` ويختفوا في App Hosting (وكمان مع `next start` محلياً).
- ⚠️ الـ `autofill` بتنده `finish()` اللي بتحفظ في Firestore، يعني في الـ dev هتتكتب docs تجريبية تحت حسابك. مقبول، أو نستخدم الـ emulator.

## 6. Hosting plan
المراجع: https://firebase.google.com/docs/app-hosting/get-started و https://firebase.google.com/docs/app-hosting/configure و https://firebase.google.com/docs/app-hosting/frameworks-tooling
- **المتطلبات:**
  - Blaze plan (لازم).
  - Next.js 13.5+ (14.2.x LTS، فـ 14.2.35 تمام).
  - Node 22+، والـ runtime لازم يتوافق مع `engines` في `package.json`، وإلا Cloud Build هيفشل.
- **Region:** الـ App Hosting backend في **`us-east4`**. الـ backend `founder-fit` كان معمول قبل كده، والـ region بتاعته مينفعش تتغيّر، وقررنا نسيبه. Vertex AI في **`us-central1`** (من `GOOGLE_CLOUD_LOCATION`، ومستقل عن region الـ server). Firestore في **`nam5`** (US multi-region)، يعني كله جوه أمريكا والـ latency بينهم صغيرة. الـ Firestore location مينفعش تتغيّر.
- **Files جديدة:**
  - `apphosting.yaml` (**من غير أي secrets**، لأن Vertex AI بيستخدم الـ service account مش API key):
    ```yaml
    runConfig:
      minInstances: 0
      maxInstances: 2        # عشان التكلفة. الـ default 100
    env:
      - variable: NEXT_PUBLIC_FIREBASE_API_KEY
        value: AIzaSyCqPFMzbP8AJsxDEhpgP4dF0n1qTbVV8Y0
        availability: [BUILD, RUNTIME]
      - variable: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
        value: founder-fit-6a455.firebaseapp.com
        availability: [BUILD, RUNTIME]
      - variable: NEXT_PUBLIC_FIREBASE_PROJECT_ID
        value: founder-fit-6a455
        availability: [BUILD, RUNTIME]
      - variable: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
        value: founder-fit-6a455.firebasestorage.app
        availability: [BUILD, RUNTIME]
      - variable: NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
        value: "455074705484"
        availability: [BUILD, RUNTIME]
      - variable: NEXT_PUBLIC_FIREBASE_APP_ID
        value: 1:455074705484:web:50923e871c7647b67e44e9
        availability: [BUILD, RUNTIME]
      # Vertex AI (server-only, مش أسرار)
      - variable: GOOGLE_CLOUD_LOCATION
        value: us-central1
        availability: [RUNTIME]
      - variable: GEMINI_MODEL
        value: gemini-3.5-flash
        availability: [RUNTIME]
    ```
    (الـ region بتاع الـ backend بيتحدد وقت إنشائه، مش في الـ yaml.)
  - `firebase.json`: يشاور على `firestore.rules` و `firestore.indexes.json`، وفيه إعدادات الـ emulator (port 8085). App Hosting مش محتاجه لما يكون مربوط بـ GitHub.
  - `.firebaserc`: `{ "projects": { "default": "founder-fit-6a455" } }`
  - `firestore.rules` و `firestore.indexes.json` (قسم 4).
  - `.env.local.example`: نفس الـ `NEXT_PUBLIC_*`، و `GOOGLE_CLOUD_LOCATION` و `GEMINI_MODEL` اختياري للـ dev المحلي.
- **Public vs secret:**
  - الـ `NEXT_PUBLIC_FIREBASE_*` مش أسرار (الحماية جاية من الـ rules)، فعادي تتكتب في `apphosting.yaml` في repo public.
  - **مفيش أسرار خالص.** الـ route بيكلم Vertex AI بالـ Application Default Credentials (ADC). في App Hosting دي بتبقى الـ runtime service account (`firebase-app-hosting-compute@founder-fit-6a455.iam.gserviceaccount.com`)، ومحلياً بتبقى حسابك من `gcloud auth application-default login`. يعني مفيش `ANTHROPIC_API_KEY` ولا Secret Manager.
  - App Hosting كمان بيحقن `FIREBASE_CONFIG`، وده اللي الـ Admin SDK بيستخدمه مع `initializeApp()`.
- **Node:** `"engines": { "node": "22" }` + runtime `nodejs22`. `firebase-admin@14.5.0` بيطلب `node >=22`، و `@google/genai` بيطلب Node 20+ (و Node 22+ من v3.0.0).
  - ⚠️ **`firebase` JS SDK v13 بيطلب Node >= 24.12.0** في الـ `@firebase/*` packages بتاعته (الـ top-level `firebase` مفيهوش `engines`، وده اللي خلّاني أفوّته في خطوة 4). عشان نفضل على Node 22 **ثبّتنا `firebase@12.19.0`** و `@firebase/rules-unit-testing@5.0.2`، وحطينا npm `overrides` لـ `@firebase/app@0.16.2` و `@firebase/app-compat@0.5.18` (نفس اللي جوه firebase 12.19.0)، لأن `firebase-admin` كان بيسحب نسخ Node 24 عن طريق `@firebase/database-compat`. الـ breaking changes بتاعة v13 كانت في AI Logic بس، فمش خسرانين حاجة. (commit `35632da`)
  - فاضل warning واحد: `eslint-visitor-keys` (dev-only) عايز Node 22.13+، والـ local عندك 22.12. مش بيأثر على App Hosting.
- **Build settings:** الـ default (`npm run build`). الـ `postinstall` بتاع Prisma اتشال (خطوة 8).
- **الـ backend الموجود** (اتأكدت منه read-only يوم 2026-10-22): `founder-fit`، region `us-east4`، repo `ScienceWerx-Inc/Founder_Fit` (الـ GitHub connection شغال بالفعل)، root `/`، live branch `main` بـ automatic rollouts، runtime **`nodejs24`**، web app `founder-fit` (`…2eae716a…`)، URL `https://founder-fit--founder-fit-6a455.us-east4.hosted.app`. ⚠️ كان بيعرض الـ `main` القديم (`681af3e`).
  - **لازم يتغيّر:** الـ runtime لـ **`nodejs22`** (عشان يطابق `engines`، وإلا الـ build يفشل)، والـ live branch لـ **`firebase-migration`** لحد ما نعمل merge لـ `main`.
  - الـ web app المربوط (`…2eae716a…`) غير اللي في `apphosting.yaml` (`FounderFit Web`، `…50923e…`). مش مشكلة، لأن الكود بيستخدم الـ `NEXT_PUBLIC_*` الصريحة.
- **Analytics:** مفيش، و `@vercel/analytics` اتشال.
- **Custom domain:** مفيش دلوقتي، والأبلكيشن هيبقى على دومين `hosted.app` الافتراضي.

## 7. AI narrative fix (Gemini على Vertex AI)
**المشكلة:** الكود القديم كان بيعمل `fetch` من الـ browser لـ `api.anthropic.com` من غير key، فكان دايماً بيفشل ويعرض الـ fallback. **القرار الجديد:** الـ narrative هيبقى بـ **Gemini على Vertex AI** (اللي Google بقت تسميه "Gemini Enterprise Agent Platform")، من الـ server route `/api/narrative`، بالـ ADC ومن غير API key.

**الـ SDK** (اتراجع في الـ docs والـ types بتاريخ 2026-10-21):
- الـ package: **`@google/genai`** (Google Gen AI SDK، آخر version **2.30.0**، Node 20+). الـ README بيقول إن الـ SDKs القديمة زي `@google-cloud/vertexai` "previous iterations of this SDK and are no longer receiving new Gemini 2.0+ features". مصدر: https://github.com/googleapis/js-genai
- الـ init لـ Vertex: **`new GoogleGenAI({ enterprise: true, project, location })`**. الـ types في 2.30.0 بتقول عن `vertexai: true`: "The `enterprise` flag is recommended instead."
- الـ auth: ADC (الـ README: `gcloud auth application-default login`). مفيش `apiKey` في وضع Vertex.

**الموديل:** **`gemini-3.5-flash`**، وممكن نغيّره من غير code عن طريق env var `GEMINI_MODEL`.
- ⚠️ **Gemini 2.5 (Pro و Flash و Flash-Lite) اتقفل على Vertex AI في 2026-10-20**، يعني مينفعش نستخدمه.
- `gemini-3.5-flash` **Stable**، والـ shutdown "no earlier than 2027-05-19".
- `gemini-3.8-flash` أحدث Stable Flash (2026-09-02)، بس معلّم "short-term availability". يعني ممكن يتقفل بعد 45 يوم بس من نزول بديل، وعشان كده اخترنا 3.5 لثبات أطول.
- مصدر: https://firebase.google.com/docs/ai-logic/models

**الـ parameters:**
- **`temperature` و `topP` و `topK`: Gemini 3.x بيتجاهلهم** ("All the general-use Gemini 4.x and Gemini 3.x models will ignore them")، فمش هنبعت `temperature: 0.3` زي الكود القديم.
- **`maxOutputTokens`: مدعوم**. الـ thinking tokens بتاخد من نفس الحد وبتتحسب بسعر الـ output، فهنحط `4096` عشان نص الـ 700 كلمة (~1000 token) ميتقطعش.
- **Thinking مينفعش يتقفل** في Gemini 3.x ("You cannot disable or turn off thinking for these models"). هنحط `thinkingConfig: { thinkingLevel: LOW }` عشان نقلل التكلفة والوقت (`LOW` مدعوم في كل موديلات 3.x؛ `MINIMAL` بيرجّع 400 على 3.7 و 3.8).
- `frequencyPenalty` و `presencePenalty` و `candidateCount` بيرجّعوا 400 على 3.7 و 3.8 Flash، فمش هنبعتهم.
- مصادر: https://firebase.google.com/docs/ai-logic/model-parameters و https://firebase.google.com/docs/ai-logic/thinking

**الـ route:** `src/app/api/narrative/route.ts` (POST، `runtime = "nodejs"`):
1. ياخد `Authorization: Bearer <idToken>` (الـ client بيجيبه بـ `await user.getIdToken()`). من غيره → **401**.
2. `getAuth(adminApp).verifyIdToken(token)`، ولو فشل → **401**. ده بيمنع أي حد بره الأبلكيشن يصرف من فلوس Vertex AI. الـ `verifyIdToken` محتاج الـ project ID بس، ومش محتاج credentials.
3. الـ body فيه `{ audience, candidateName, asset_context, result }` بس، وحد أقصى **200 KB** → **413** لو أكبر، و **400** لو الـ JSON بايظ أو ناقص.
4. الـ `system` prompt والـ user template اتنقلوا لـ `src/lib/narrative/prompt.ts` (server-only)، عشان الـ client ميقدرش يغيّر الـ instructions.
5. يستدعي Gemini:
```ts
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
const ai = new GoogleGenAI({
  enterprise: true,
  project: process.env.GOOGLE_CLOUD_PROJECT ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  location: process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1",
});
const res = await ai.models.generateContent({
  model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash",
  contents: user,
  config: {
    systemInstruction: system,
    maxOutputTokens: 4096,
    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
  },
});
const text = res.text?.trim();
if (!text) return Response.json({ error: "empty" }, { status: 502 });
return Response.json({ narrative: text });
```
   أي error من Vertex → **502** برسالة عامة، والتفاصيل في الـ server log بس.
6. **الحفظ في Firestore:** الـ client (`generateNarrative`) بينده `/api/narrative`، ولو نجح يعمل `updateDoc(..., { narrative, updatedAt: serverTimestamp() })` على `savedId`. الـ rules بتسمح بالـ update ده بس.
- الـ fallback الحالي (deterministic narrative) يفضل زي ما هو لو حصل أي error (401 أو 413 أو 502 أو network).
- Packages جديدة: `@google/genai` (2.30.0) و `firebase-admin` (14.5.0).

**الـ APIs اللي لازم تتفعّل في `founder-fit-6a455`:**
| API | ليه |
|---|---|
| `aiplatform.googleapis.com` (Vertex AI / Gemini Enterprise Agent Platform API) | الـ narrative. **ده الجديد.** |
| `firestore.googleapis.com` | Firestore (بيتفعّل لما الـ database تتعمل) |
| `identitytoolkit.googleapis.com` | Firebase Auth (اتفعّل لما فعّلت Google sign-in) |
| `firebaseapphosting.googleapis.com`، `cloudbuild.googleapis.com`، `run.googleapis.com`، `secretmanager.googleapis.com` | App Hosting. ⚠️ عادةً الـ Console بيفعّلهم وانت بتعمل الـ backend، اتأكد في الخطوة دي |

الأمر: `gcloud services enable aiplatform.googleapis.com --project founder-fit-6a455`. محتاج `serviceusage.services.enable`، ودي موجودة في Editor. ✅ **اتفعّل 2026-10-22.**

**الـ IAM roles:**
| مين | الـ role | ليه | مين يقدر يديه |
|---|---|---|---|
| App Hosting runtime SA `firebase-app-hosting-compute@founder-fit-6a455.iam.gserviceaccount.com` | **`roles/aiplatform.user`** (Vertex AI User) | الـ route يقدر ينده Gemini. الـ docs بتقول: "you might need to add roles/aiplatform.user or some related role" (https://firebase.google.com/docs/app-hosting/about-app-hosting) | ⚠️ **Owner** (أو حد عنده `resourcemanager.projects.setIamPolicy`). **الـ Editor ميقدرش يدّي IAM roles.** |
| انت محلياً (حسابك الـ Editor) | `roles/aiplatform.user` | تجرّب الـ narrative الحقيقي من `localhost` | الـ Editor غالباً فيه صلاحيات Vertex AI بالفعل. مش متأكد 100%، ولو طلع 403 اطلب الـ role من الـ Owner |
| حد | ولا حاجة زيادة لـ `verifyIdToken` | بيستخدم Google public keys | — |

الأمر للـ Owner:
```
gcloud projects add-iam-policy-binding founder-fit-6a455 \
  --member="serviceAccount:firebase-app-hosting-compute@founder-fit-6a455.iam.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```
الـ service account ده **موجود بالفعل**، وعنده حالياً `developerconnect.readTokenAccessor` و `firebase.sdkAdminServiceAgent` و `firebaseapphosting.computeRunner` بس، فالـ Owner يقدر يدّيه `roles/aiplatform.user` دلوقتي.

## 8. Security findings
1. **`.env` و `dev.db` committed** (من أول commit `709122d`). `.gitignore` كان فيه `.env*.local` بس.
   - `.env` = `DATABASE_URL="file:./dev.db"` بس، ومفيش سر.
   - `dev.db` = schema بس، و **0 rows**.
   - عملت scan على كل الـ git history بـ `sk-ant|api_key|secret|password|AIza`. الـ matches الوحيدة أمثلة documentation جوه `.agents/skills`.
   - ⇒ **مش محتاجين history cleanup**. اتعمل `git rm --cached` + `.gitignore` في خطوة 1. ✅
2. **Server action مفتوحة:** `saveAssessment` (`actions.ts`) كانت POST endpoint public من غير auth. اتشالت في خطوة 8. ✅
3. **مفيش API keys للـ AI خالص:** Vertex AI بيستخدم الـ service account (ADC)، فمفيش key ممكن يتسرّب. الـ `NEXT_PUBLIC_FIREBASE_*` مش أسرار.
4. **Cost abuse على الـ narrative route:**
   - `verifyIdToken` (401 من غير token صالح)، وحد للحجم (413).
   - `maxOutputTokens: 4096` و `thinkingLevel: LOW` بيحطوا سقف لكل call.
   - `maxInstances: 2`، و budget alert في GCP Billing.
   - الـ per-uid rate limit يتعمل لاحقاً.
5. **PII:** `candidateName` + إجابات الـ `context` (خبرة، runway مالي، التزامات) + الـ results. اللي بيتبعت لـ Vertex AI في الـ prompt هو الـ `candidateName` والـ result بس، مش الـ context، والـ data بتفضل جوه نفس الـ Google Cloud project. الـ rules بتقفل الـ docs على صاحبها، وصفحة Phase 2 لازم يبقى فيها delete.
6. **الـ score بيتحسب في الـ client:** الـ user يقدر يزوّر نتيجته، بس في بياناته هو. مقبول حسب الـ "Prototype note".
7. **Repo public:** لازم الـ rules تتعمل deploy **قبل** أول استخدام حقيقي، والـ database تتعمل في Production mode.
8. **`hasOnly` في الـ rules** بيمنع حد يحط fields زيادة (مثلاً `isAdmin`) أو يكبّر الـ doc بـ junk.
9. **الـ dev tools:** زرار الـ autofill مخفي في production (قسم 5).
10. **الـ prompt على السيرفر:** الـ client بيبعت data بس، والـ system instructions مش بتيجي منه.
11. **App Check (اختياري، بعدين):** يحمي Firestore و الـ route من scripts بره الأبلكيشن.

## 9. File-by-file change list
**Phase 1 (لحد أول deploy):**
| Action | File | ليه |
|---|---|---|
| Add | `apphosting.yaml` | runConfig + env (من غير secrets) |
| Add | `firebase.json` | الـ rules والـ indexes + الـ emulator ✅ |
| Add | `.firebaserc` | default project `founder-fit-6a455` ✅ |
| Add | `firestore.rules` | owner-only + `hasOnly` + `context` (قسم 4) ✅ |
| Add | `firestore.indexes.json` | exemption لـ `report` من الـ indexing ✅ |
| Add | `.env.local.example` | توثيق الـ env vars المحلية ✅ |
| Add | `src/lib/firebase/client.ts` | init client SDK + auth + db (+ emulator اختياري) ✅ |
| Add | `src/lib/firebase/admin.ts` | Admin SDK (server-only)، لـ `verifyIdToken` |
| Add | `src/lib/assessments.ts` | `createAssessment()` ✅ و `saveNarrative()` |
| Add | `src/app/AuthGate.tsx`، `src/app/theme.ts` | الـ gate + `useAuth()` + sign-in/out، والـ color tokens ✅ |
| Add | `src/app/api/narrative/route.ts` | Gemini على Vertex AI من السيرفر (`gemini-3.5-flash`) |
| Add | `src/lib/narrative/prompt.ts` | الـ prompts نازلة من `page.tsx` (server-only) |
| Add | `src/lib/narrative/handler.ts` | منطق الـ route (auth + validation + Gemini)، مفصول عشان يتختبر بـ mocks |
| Add | `tests/*.test.mjs` | rules + save ✅ + narrative route |
| Modify | `src/app/page.tsx` | التفاصيل تحت الجدول |
| Modify | `src/app/layout.tsx` | تشيل `@vercel/analytics` ✅ |
| Modify | `package.json` | `+firebase ✅ +firebase-admin +@google/genai`، و `-@vercel/analytics -prisma -@prisma/client ✅`، وتشيل `postinstall` ✅، وتضيف `engines.node: "22"` |
| Modify | `.gitignore` | `.env`، `*.db`، `.firebase/`، debug logs ✅ |
| Modify | `README.md` | Firebase + Vertex AI بدل Vercel/Prisma |
| Delete | `src/app/actions.ts`، `prisma/`، `prisma7.config.ts` | Prisma خلاص ✅ |
| Delete | `.agents/`، `.claude/skills/`، `.windsurf/skills/`، `skills-lock.json` | Prisma agent skills ✅ |
| Delete (untrack) | `.env`، `dev.db` | `git rm --cached` ✅ |
| Delete | `fix_*.py` (4)، `patch_*.py` (6) | سكريبتات one-off خلصت ✅ |

التعديلات في `src/app/page.tsx`:
- import لـ `AuthGate`/`useAuth` و Firestore ✅.
- Firestore save فيه `context` بدل `saveAssessment`، و `savedId` state ✅.
- الـ autofill بيبعت الـ name والـ context والـ waiver note لـ `finish()` مباشرة ✅.
- `generateNarrative` تنده `/api/narrative` بالـ ID token، وبعدين `saveNarrative` (updateDoc). الـ prompts بتتشال من الـ client.
- sign-out في الـ headers ✅، و `SHOW_DEV_TOOLS` على زراير الـ autofill ✅، و `<AuthGate>` ✅.

**Phase 2 (بعد أول deploy ناجح):**
| Action | File | ليه |
|---|---|---|
| Add | `src/app/assessments/page.tsx` | صفحة "My assessments": list (`orderBy("createdAt","desc")`)، و open، و delete |
| Modify | `src/app/page.tsx` | لينك "My assessments" في الـ header، وفتح report محفوظ |

**بعدين (منفصل):**
| Action | File | ليه |
|---|---|---|
| Modify | `next.config.mjs` | نشيل `ignoreBuildErrors` و `ignoreDuringBuilds` بعد ما نصلّح الـ errors |
| Modify/Add | `src/app/page.tsx` → modules | تقسيم الملف |

## 10. Step-by-step implementation plan
كل خطوة صغيرة وليها test. (✅ = اتعملت على branch `firebase-migration`)

**Phase 1:**
0. ✅ `6f2ba9e` **Baseline:** `npm ci && npm run build`. Test: الـ build بيعدّي، و `git status` نضيف.
1. ✅ `10cefd7` **Cleanup:** سكريبتات الـ py، و `git rm --cached .env dev.db`، و `.gitignore`.
2. ✅ `3330671` **شيل Vercel analytics.**
3. ✅ `88d83ee` **Dev-only autofill.**
4. ✅ `07ba5f5` **Firebase client init** (كان `firebase@13.0.0`؛ اتثبّت على `12.19.0` في `35632da` عشان Node 22).
5. ✅ `8c3a00c` **AuthGate + sign-in/out** (اتجرّب في الـ browser).
6. ✅ `bf3c75b` **Firestore rules + indexes** + `firebase.json`/`.firebaserc`. Test: 22 case في الـ emulator. ✅ اتعمل deploy على الـ database الحقيقية (`nam5`) يوم 2026-10-22 بموافقتك (`firebase deploy --only firestore --project founder-fit-6a455`). الـ live ruleset (`2558d0ed…`) مطابق لـ `firestore.rules` حرف بحرف، والـ index exemption بتاع `report` live.
7. ✅ `fc7787a` **Firestore save بدل Prisma.** Test: real scoring output في الـ emulator. ⏳ الـ end-to-end على الـ database الحقيقية: انت بتجرّبه من `npm run dev`.
8. ✅ `0ff27e5` **شيل Prisma + الـ agent skills.** Test: `npm ci && npm run build`، و `grep -ri prisma src` فاضي.
   - ✅ `c647281` **fix:** الـ sample waiver note بيتبعت لـ `finish()`، فـ "Run Sample" بقى بيدّي 67 بدل 0 على الـ sensing asset.
9. **Narrative route (Vertex AI):** `npm i @google/genai firebase-admin`، والـ route، والـ prompt module، والـ client call، و `saveNarrative`. Test (من غير access حقيقي):
   - 401 من غير token، و 401 بـ token بايظ
   - 413 لو الـ body أكبر من 200 KB، و 400 لو الـ body بايظ
   - 502 + الـ client يعرض الـ fallback لو Gemini فشل
   - نجاح بـ mock لـ Gemini، ويتأكد من الـ model والـ config
   - الـ `saveNarrative` في الـ emulator تحت الـ rules الحقيقية

   Test الحقيقي (محلياً): `gcloud auth application-default login` + `aiplatform.googleapis.com` متفعّل (قسم 7).
10. ✅ **`apphosting.yaml` + `engines`.** Test: `npm ci` + `npm run build` بـ Node 22 في نسخة نضيفة من الـ repo من غير `.env.local`، بالـ env اللي في `apphosting.yaml` بس.
   - ✅ `387eb17` **feat:** `GEMINI_API_KEY` اختياري للـ dev المحلي (Gemini Developer API)، وإلا Vertex AI. بيتجاهل في production، ومش موجود في `apphosting.yaml`.
11. **App Hosting backend** (`founder-fit`، `us-east4`، موجود): نعمل push لـ `firebase-migration`، ونغيّر الـ runtime لـ `nodejs22` والـ live branch لـ `firebase-migration`، ونعمل rollout. ✅ Vertex AI API اتفعّل. الـ **Owner** يدّي `roles/aiplatform.user` للـ runtime SA. Test: الـ URL بيفتح الكود الجديد.
12. **Authorized domain** `founder-fit--founder-fit-6a455.us-east4.hosted.app`، و smoke test كامل: login، assessment، save، narrative، PDF، والـ autofill **مش ظاهر**.
13. **README.**

**Phase 2 (بعد ما خطوة 12 تنجح):**

14. **صفحة "My assessments":** list بـ `query(collection(db,"users",uid,"assessments"), orderBy("createdAt","desc"))`، و open report محفوظ، و delete. Test: تشوف assessments بتاعتك بس، والـ delete بيمسح من Firestore.

**بعدين (منفصل، L):**

15. نشيل `ignoreBuildErrors`/`ignoreDuringBuilds` ونصلّح الـ TS/ESLint errors (حالياً 210).
16. نقسم `page.tsx` (constants/scoring/data/components) من غير ما نغيّر السلوك.

## 11. Firebase Console checklist (بالترتيب)
1. Project `founder-fit-6a455` → Upgrade لـ **Blaze**، وتعمل **budget alert** في GCP Billing.
2. ✅ Project settings → Your apps → **Add Web app** (الـ config اتحط في `.env.local`).
3. ✅ Authentication → Sign-in method → **Google → Enable**.
4. ✅ **(Owner)** Firestore Database → Create database → **Standard edition** → Location: **`nam5`** (US multi-region؛ مينفعش تتغيّر) → Native mode. اتعملت 2026-10-21.
   - 💡 اختياري: فعّل **delete protection** (حالياً `DELETE_PROTECTION_DISABLED`): `gcloud firestore databases update --database="(default)" --delete-protection --project founder-fit-6a455`. ممكن كمان Point-in-time recovery (حالياً disabled، وليه تكلفة).
5. ✅ Deploy للـ rules والـ indexes (`firebase deploy --only firestore`)، 2026-10-22. اتأكدت إن الـ live rules مطابقة للـ file.
6. ✅ **Vertex AI:** `gcloud services enable aiplatform.googleapis.com --project founder-fit-6a455`. اتفعّل 2026-10-22.
7. App Hosting: الـ backend **`founder-fit` موجود** (`us-east4`، GitHub متوصّل). Settings → **Runtime: `nodejs22`** (كان `nodejs24`)، و Deployment → **live branch: `firebase-migration`** (root `/`، auto rollouts on). وبعدين Rollouts → **Create rollout** من `firebase-migration`.
8. **(Owner)** IAM → تدّي **`roles/aiplatform.user`** لـ `firebase-app-hosting-compute@founder-fit-6a455.iam.gserviceaccount.com` (الأمر في قسم 7). الـ SA موجود، فينفع دلوقتي.
9. Authentication → Settings → **Authorized domains → Add `founder-fit--founder-fit-6a455.us-east4.hosted.app`**.
10. لما الـ smoke test ينجح: merge `firebase-migration` لـ `main`، ونرجّع الـ live branch لـ `main`. ⚠️ لو Vercel لسه بيعمل build من `main` هيفشل (مفيش Firebase env vars هناك)، فيُفضّل يتقفل أو يتشال الأول.

## 12. Risks & open questions
**قرارات اتاخدت (للتوثيق):**
- Project `founder-fit-6a455`. App Hosting في **`us-east4`** (الـ backend الموجود `founder-fit`، اتقرر نسيبه)، و Vertex AI في `us-central1`، و Firestore في **`nam5`** (Standard، Native). الـ Owner اختار `nam5` وهنسيبها.
- **الـ narrative بـ Gemini على Vertex AI** (`@google/genai`، `enterprise: true`، الموديل `gemini-3.5-flash` قابل للتغيير بـ `GEMINI_MODEL`)، بالـ ADC ومن غير API key. Anthropic اتشال من الخطة.
- الـ narrative بيتحفظ، والـ `context` بيتحفظ.
- "My assessments" في Phase 2.
- الـ agent skills اتمسحت مع Prisma.
- مفيش analytics ولا custom domain دلوقتي.
- الـ autofill dev-only.
- Re-score: كل مرة بتعمل **doc جديد**. كده الـ history بيتحفظ، والـ rules بتفضل strict (الـ update مسموح للـ `narrative` بس).
- Retention: زرار الـ delete في Phase 2 كفاية دلوقتي.

**مستني:**
- الـ **Owner** يدّي `roles/aiplatform.user` للـ App Hosting SA بعد ما الـ backend يتعمل (الـ Editor ميقدرش). الـ Firestore database ✅ اتعملت.

**Risks:**
- ⚠️ **توافر `gemini-3.5-flash` في `us-central1` مش متأكد منه.** الـ docs بتقول الـ locations "depend on the model" وبتنصح بـ `global`، وفيه bug report عن 404 لـ 3.5 Flash في `us-central1` عند project معيّن (https://github.com/cline/cline/issues/11490). لو طلع 404، غيّر `GOOGLE_CLOUD_LOCATION` لـ `global` من غير تعديل في الـ code.
- الموديلات بتتغيّر بسرعة: Gemini 2.5 اتقفل امبارح (2026-10-20). خلّي `GEMINI_MODEL` في `apphosting.yaml` وراجع https://firebase.google.com/docs/ai-logic/models كل كام شهر.
- الـ thinking tokens بتتحسب بسعر الـ output ومينفعش تتقفل. `thinkingLevel: LOW` و `maxOutputTokens: 4096` بيحطوا سقف.
- الـ Editor role غالباً كفاية لتجربة Vertex محلياً، بس مش متأكد. لو 403، محتاج `roles/aiplatform.user`.
- الـ backend كان بيعرض الـ `main` القديم على `https://founder-fit--founder-fit-6a455.us-east4.hosted.app` لحد ما الـ live branch تتغيّر. وأي merge لـ `main` بيعمل rollout أوتوماتيك.
- الـ popup ممكن يتعمله block، والرسالة الواضحة اتعملت ✅.
- شيل `ignoreBuildErrors` هيطلّع 210 TS error، وعشان كده هو خطوة منفصلة.
- تكاليف Blaze: Cloud Run + Cloud Build + Firestore + Vertex AI. الـ `maxInstances: 2` والـ budget alerts بيقللوا المخاطرة.
- GitHub org permissions ممكن تأخر خطوة 11.
- الـ rules بتتطلب الـ fields بالظبط، فأي field جديد في الـ code من غير تحديث الـ rules هيخلي الـ save يفشل (`permission-denied`). لازم يتحدّثوا مع بعض.
- `npm audit`: 17 vulnerability (1 critical) من الـ baseline، لسه ما اتراجعتش.
- Firestore في `nam5` (multi-region) أغلى شوية من regional للـ storage والـ operations. عند حجم البيانات ده الفرق صغير.
- الـ database delete protection مقفول حالياً، ويُفضّل يتفعّل (قسم 11، خطوة 4).
- الـ `overrides` في `package.json` (`@firebase/app` و `@firebase/app-compat`) لازم تتشال أو تتحدّث لما نطلع `firebase` لـ v13 (ساعتها لازم Node 24.12+ في الـ `engines` والـ App Hosting runtime والـ local).

**مصادر:**
- https://firebase.google.com/docs/app-hosting/get-started
- https://firebase.google.com/docs/app-hosting/configure
- https://firebase.google.com/docs/app-hosting/frameworks-tooling
- https://firebase.google.com/docs/app-hosting/firebase-sdks
- https://firebase.google.com/docs/app-hosting/about-app-hosting (الـ runtime SA و `roles/aiplatform.user`)
- https://firebase.google.com/docs/auth/web/google-signin
- https://firebase.google.com/docs/auth/web/redirect-best-practices
- https://firebase.google.com/docs/firestore/quotas
- https://firebase.google.com/docs/firestore/manage-data/data-types
- https://firebase.google.com/docs/firestore/security/rules-conditions
- https://github.com/googleapis/js-genai (الـ `@google/genai` SDK)
- https://firebase.google.com/docs/ai-logic/models (الموديلات وتواريخ الـ shutdown)
- https://firebase.google.com/docs/ai-logic/model-parameters (الـ temperature بيتجاهل، والـ maxOutputTokens)
- https://firebase.google.com/docs/ai-logic/thinking (thinking levels)
- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/model-versions و https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/locations (الـ tool ما قدرش يقرا الـ tables بتاعتهم، فراجعهم بنفسك)
- https://firebase.google.com/codelabs/ai-genkit-rag (أمر الـ `add-iam-policy-binding` للـ `firebase-app-hosting-compute` SA)
- Package versions اتجابت بـ `npm view` في 2026-10-21/22: firebase 12.19.0 (مثبّت؛ 13.0.0 محتاج Node >=24.12)، firebase-admin 14.5.0 (node >=22)، @google/genai 2.30.0 (node >=20)، firebase-tools 15.34.0.
