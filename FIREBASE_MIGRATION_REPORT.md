# FounderFit → Firebase: تقرير الـ Migration

> اتعمل بـ read-only analysis بتاريخ 2026-10-21 على commit `681af3e`.
> Firebase Project ID: **`founder-fit-6a455`**. الـ region: **`us-central1`** (App Hosting و Firestore).

## 1. Executive summary
- الأبلكيشن دلوقتي عبارة عن صفحة Next.js 14.2.35 واحدة (`src/app/page.tsx` فيها 1325 سطر، `'use client'`). الـ scoring كله شغال في الـ browser. الحفظ بيحصل من خلال server action بتستخدم Prisma 7 على SQLite.
- مفيش login خالص، وأي حد يقدر ينده الـ server action ويكتب في الـ DB.
- الـ AI narrative بينده `api.anthropic.com` من الـ browser من غير API key، فهو **دايماً بيفشل** وبيرجع للـ fallback.
- الـ Prisma setup نفسه غالباً مكسور: Prisma 7 من غير driver adapter، والـ config file اسمه غلط. يعني الحفظ غالباً مش شغال أصلاً.
- المطلوب:
  - Firestore (client SDK + security rules)
  - Google sign-in gate
  - API route على السيرفر للـ narrative، والـ key في Secret Manager، والـ narrative يتحفظ في Firestore
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
| Database | Prisma 7 + SQLite، والـ setup غالباً مكسور | Firestore Standard edition في `us-central1`، و `users/{uid}/assessments` بالـ client SDK (فيها `context` و `narrative`)، وشيل Prisma كله | M |
| Auth | مفيش | Firebase Auth بـ Google (`signInWithPopup`)، و `AuthGate`، وزرار sign-out | M |
| Hosting/Build | Vercel (ضمني) | `apphosting.yaml`، و `engines.node: 22`، و backend في `us-central1` مربوط بـ GitHub، و Blaze plan | S |
| Env vars & secrets | `.env` committed، ومفيش secrets | `NEXT_PUBLIC_FIREBASE_*` (public)، و `ANTHROPIC_API_KEY` في Secret Manager، و `.env.local` (gitignored) | S |
| Security | server action مفتوحة لأي حد، ومفيش rules | `firestore.rules` owner-only مع `hasOnly`، و ID token verification في الـ narrative route، و cost guard | M |
| AI narrative call | `fetch` من الـ browser من غير key (`page.tsx:1043`) | API route على السيرفر + `@anthropic-ai/sdk` (`claude-sonnet-4-6`) + verify ID token + حفظ في Firestore | M |
| Analytics | `@vercel/analytics` (`layout.tsx:2,31`) | تتشال، ومفيش بديل دلوقتي | S |
| Code quality/build health | `ignoreBuildErrors` و `ignoreDuringBuilds`، و `page.tsx` 1325 سطر، و 10 سكريبتات py، والـ autofill ظاهر في production | تتمسح السكريبتات، والـ autofill dev-only. بعدين (منفصل) نشيل الـ ignore ونصلّح الـ TS ونقسم الملف | L |
| Docs | README بيتكلم عن Vercel + Prisma (`README.md:10-16,38-46,56-65`) | README جديد: Firebase setup، و env vars، و deploy | S |

## 4. Database plan
**الـ structure:** subcollection `users/{uid}/assessments/{assessmentId}`. الـ ID بيتعمل auto بـ `addDoc`.
ليه subcollection؟ عشان الـ rule تبقى بسيطة (`uid` جزء من الـ path)، والـ listing بتاع صفحة "My assessments" (Phase 2) يبقى query بسيط من غير composite index. هنحط `ownerUid` في الـ doc كمان.

**Database:** Firestore **Standard edition**، location **`us-central1`** (regional). الـ `(default)` database.

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
  - Settings → Authorized domains: `localhost` و `founder-fit-6a455.firebaseapp.com` موجودين default. لازم تضيف دومين App Hosting، وشكله غالباً `<backend-id>--founder-fit-6a455.us-central1.hosted.app` (**اتأكد منه بالظبط من صفحة الـ backend**).
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
- **Region:** **`us-central1`** للـ App Hosting backend و **`us-central1`** (regional، مش multi-region `nam5`) للـ Firestore. كده الـ server والـ DB في نفس المكان، فالـ latency بينهم أقل والـ egress أرخص. الـ Firestore location **مينفعش تتغيّر بعد الإنشاء**.
- **Files جديدة:**
  - `apphosting.yaml`:
    ```yaml
    runConfig:
      minInstances: 0
      maxInstances: 2        # عشان التكلفة. الـ default 100
    env:
      - variable: NEXT_PUBLIC_FIREBASE_API_KEY
        value: <from console: Web app config>
        availability: [BUILD, RUNTIME]
      - variable: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
        value: founder-fit-6a455.firebaseapp.com
        availability: [BUILD, RUNTIME]
      - variable: NEXT_PUBLIC_FIREBASE_PROJECT_ID
        value: founder-fit-6a455
        availability: [BUILD, RUNTIME]
      - variable: NEXT_PUBLIC_FIREBASE_APP_ID
        value: <from console: Web app config>
        availability: [BUILD, RUNTIME]
      - variable: ANTHROPIC_API_KEY
        secret: anthropic-api-key
        availability: [RUNTIME]
    ```
    (الـ region بيتحدد وقت إنشاء الـ backend، مش في الـ yaml.)
  - `firebase.json`: يشاور على `firestore.rules` و `firestore.indexes.json` (`firebase deploy --only firestore`). App Hosting مش محتاجه لما يكون مربوط بـ GitHub.
  - `.firebaserc`: `{ "projects": { "default": "founder-fit-6a455" } }`
  - `firestore.rules` و `firestore.indexes.json` (قسم 4).
  - `.env.local.example`: نفس الـ `NEXT_PUBLIC_*` + `ANTHROPIC_API_KEY=` للـ dev المحلي.
- **Public vs secret:**
  - الـ `NEXT_PUBLIC_FIREBASE_*` مش أسرار (الحماية جاية من الـ rules)، فعادي تتكتب في `apphosting.yaml` في repo public.
  - `ANTHROPIC_API_KEY` secret: `firebase apphosting:secrets:set anthropic-api-key --project founder-fit-6a455` (بيعرض يدّي الـ access، وغير كده `firebase apphosting:secrets:grantaccess anthropic-api-key`).
  - App Hosting كمان بيحقن `FIREBASE_CONFIG`، وده اللي الـ Admin SDK بيستخدمه مع `initializeApp()`.
- **Node:** `"engines": { "node": "22" }` + runtime `nodejs22`. كمان `firebase-admin@14.5.0` نفسه بيطلب `node >=22`.
- **Build settings:** الـ default (`npm run build`). لازم **نشيل `"postinstall": "prisma generate"`** (`package.json:8`).
- **GitHub:** Console → App Hosting → Create backend → region `us-central1` → Connect GitHub → `ScienceWerx-Inc/Founder_Fit`، root `/`، live branch `main`، automatic rollouts on. ⚠️ الـ repo تبع GitHub org، فممكن تحتاج org admin يوافق على الـ Firebase GitHub app.
- **Analytics:** مفيش، و `@vercel/analytics` بيتشال بس.
- **Custom domain:** مفيش دلوقتي، والأبلكيشن هيبقى على دومين `hosted.app` الافتراضي.

## 7. AI narrative fix
**المشكلة:** `page.tsx:1043-1047` بيعمل `fetch` من الـ browser لـ `api.anthropic.com` من غير `x-api-key` ولا `anthropic-version`، فالـ request بيترفض والـ UI بيعرض الـ fallback (`page.tsx:1053`). ولو حطينا key في الـ browser هيبقى مكشوف. يعني App Hosting لوحده مش هيحل المشكلة.

**اختيار الموديل:** طلبت `claude-sonnet-5-5` لو الـ parameters بتاعته متوافقة مع الـ call بتاعنا. راجعت الـ docs الحالية (https://platform.claude.com/docs/en/models/sonnet-5-5/migration-guide):
- Sonnet 5.5 بيرجّع **400** على "sampling parameters". الـ guide بيقول: "Remove non-default `temperature`, `top_p`, and `top_k` values."
- والـ call بتاعنا فيه `temperature: 0.3` (`page.tsx:1046`)، وده non-default.
- كمان thinking بيبقى **on by default** على Sonnet 5.5، وده بيستهلك من `max_tokens`.

⇒ **مش متوافق كده، فهنفضل على `claude-sonnet-4-6`** زي ما قلت. (لو حبيت تنقل بعدين: تشيل `temperature`، وتكبّر `max_tokens`، وتحط `output_config.effort`، ودي تغييرات بسيطة.)

**الحل:** `src/app/api/narrative/route.ts` (POST، runtime nodejs):
1. ياخد `Authorization: Bearer <idToken>` (الـ client بيجيبه بـ `await user.getIdToken()`).
2. `getAuth(adminApp).verifyIdToken(token)`، ولو فشل يرجّع 401. ده بيمنع أي حد بره الأبلكيشن يصرف من رصيد Anthropic.
3. ياخد في الـ body `{ audience, candidateName, asset_context, result }` بس، مع حد أقصى للحجم (مثلاً 200 KB).
4. الـ `system` prompt (`page.tsx:996-1027`) والـ user template (`page.tsx:1029-1041`) يتنقلوا لـ `src/lib/narrativePrompt.ts` (server-only).
5. يستدعي Anthropic SDK:
```ts
import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic(); // بيقرا ANTHROPIC_API_KEY (App Hosting secret)

const msg = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 2000,             // الحالي 1000 ممكن يقطع نص الـ 700 كلمة
  temperature: 0.3,
  system,
  messages: [{ role: "user", content: user }],
});
if (msg.stop_reason === "refusal") return Response.json({ error: "refused" }, { status: 422 });
const text = msg.content.filter(b => b.type === "text").map(b => b.text).join("\n");
return Response.json({ narrative: text });
```
6. **الحفظ في Firestore:** الـ client (`generateNarrative`، `page.tsx:982`) بينده `/api/narrative`، ولو نجح يعمل:
   ```ts
   await updateDoc(doc(db, "users", user.uid, "assessments", savedId),
                   { narrative: text, updatedAt: serverTimestamp() });
   ```
   والـ rules بتسمح بالـ update ده بس.
- الـ fallback الحالي (deterministic narrative) يفضل زي ما هو لو حصل أي error.
- Packages جديدة: `@anthropic-ai/sdk` (آخر version 0.137.0) و `firebase-admin` (14.5.0).
- محلياً: `ANTHROPIC_API_KEY` في `.env.local`، والـ Admin SDK محتاج ADC (`gcloud auth application-default login`) أو `GOOGLE_CLOUD_PROJECT=founder-fit-6a455`، ودي هتتجرّب في خطوتها.

## 8. Security findings
1. **`.env` و `dev.db` committed** (من أول commit `709122d`). `.gitignore` فيه `.env*.local` بس.
   - `.env` = `DATABASE_URL="file:./dev.db"` بس، ومفيش سر.
   - `dev.db` = schema بس، و **0 rows**.
   - عملت scan على كل الـ git history بـ `sk-ant|api_key|secret|password|AIza`. الـ matches الوحيدة أمثلة documentation جوه `.agents/skills`.
   - ⇒ **مش محتاجين history cleanup**. كفاية `git rm --cached .env dev.db` + `.gitignore`.
2. **Server action مفتوحة:** `saveAssessment` (`actions.ts:10`) هي POST endpoint public من غير auth. بتتشال.
3. **مفيش Anthropic key مكشوف**، والـ key لازم يفضل server-only (من غير `NEXT_PUBLIC_`).
4. **Cost abuse على الـ narrative route:** فيه auth. وكمان spend limit في Anthropic Console، و budget alert في GCP Billing، و `maxInstances: 2`. والـ per-uid rate limit يتعمل لاحقاً.
5. **PII:** `candidateName` + إجابات الـ `context` (خبرة، runway مالي، التزامات) + الـ results. الـ rules بتقفلها على صاحبها، ودي data حساسة شوية، فصفحة Phase 2 لازم يبقى فيها delete.
6. **الـ score بيتحسب في الـ client:** الـ user يقدر يزوّر نتيجته، بس في بياناته هو. مقبول حسب الـ "Prototype note".
7. **Repo public:** لازم الـ rules تتعمل deploy **قبل** أول استخدام حقيقي، والـ database تتعمل في Production mode.
8. **`hasOnly` في الـ rules** بيمنع حد يحط fields زيادة (مثلاً `isAdmin`) أو يكبّر الـ doc بـ junk.
9. **الـ dev tools:** زرار الـ autofill مخفي في production (قسم 5).
10. **App Check (اختياري، بعدين):** يحمي Firestore و الـ route من scripts بره الأبلكيشن.

## 9. File-by-file change list
**Phase 1 (لحد أول deploy):**
| Action | File | ليه |
|---|---|---|
| Add | `apphosting.yaml` | runConfig + env + secret |
| Add | `firebase.json` | يشاور على الـ rules والـ indexes |
| Add | `.firebaserc` | default project `founder-fit-6a455` |
| Add | `firestore.rules` | owner-only + `hasOnly` + `context` (قسم 4) |
| Add | `firestore.indexes.json` | exemption لـ `report` من الـ indexing |
| Add | `.env.local.example` | توثيق الـ env vars المحلية |
| Add | `src/lib/firebase/client.ts` | init client SDK + auth + db |
| Add | `src/lib/firebase/admin.ts` | Admin SDK (server-only)، لـ `verifyIdToken` |
| Add | `src/app/AuthGate.tsx` | الـ gate + `useAuth()` + sign-in/out |
| Add | `src/app/api/narrative/route.ts` | Anthropic من السيرفر (`claude-sonnet-4-6`) |
| Add | `src/lib/narrativePrompt.ts` | الـ prompts نازلة من `page.tsx` |
| Modify | `src/app/page.tsx` | التفاصيل تحت الجدول |
| Modify | `src/app/layout.tsx` | تشيل `@vercel/analytics` (السطور 2 و 31) |
| Modify | `package.json` | `+firebase +firebase-admin +@anthropic-ai/sdk`، و `-@vercel/analytics -prisma -@prisma/client`، وتشيل `postinstall`، وتضيف `engines.node: "22"` |
| Modify | `package-lock.json` | بيتولّد من npm |
| Modify | `.gitignore` | `.env`، `*.db`، `.firebase/`، `firebase-debug.log`، وتشيل `/src/generated/prisma` |
| Modify | `README.md` | Firebase بدل Vercel/Prisma |
| Delete | `src/app/actions.ts` | Prisma server action |
| Delete | `prisma/schema.prisma`، `prisma7.config.ts` | Prisma خلاص |
| Delete | `.agents/`، `.claude/skills/`، `.windsurf/skills/`، `skills-lock.json` | Prisma agent skills، بيتمسحوا مع Prisma |
| Delete (untrack) | `.env`، `dev.db` | `git rm --cached` |
| Delete | `fix_*.py` (4)، `patch_*.py` (6) | سكريبتات one-off خلصت |

التعديلات في `src/app/page.tsx`:
- import لـ `AuthGate`/`useAuth` و Firestore.
- Firestore save فيه `context` بدل `saveAssessment` (956)، و `savedId` state.
- `generateNarrative` تنده `/api/narrative` وبعدين `updateDoc` (1043).
- sign-out في `shell` (1078).
- `SHOW_DEV_TOOLS` على زراير الـ autofill (1078، ~1113).
- `<AuthGate>` (1323).

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
كل خطوة صغيرة وليها test.

**Phase 1:**
0. **Baseline:** `npm ci && npm run build`، ونسجّل النتيجة الحقيقية (ما اتعملتش في التحليل). Test: الـ build بيعدّي، و `git status` نضيف.
1. **Cleanup:** نمسح سكريبتات الـ py، و `git rm --cached .env dev.db`، ونحدّث `.gitignore`. Test: `npm run build` + `git status`.
2. **شيل Vercel analytics** من `layout.tsx` و `package.json`. Test: الـ build + الصفحة بتفتح.
3. **Dev-only autofill:** `SHOW_DEV_TOOLS` على الزرارين. Test: ظاهرين في `npm run dev`، ومخفيين في `npm run build && npm start`.
4. **Firebase client init:** `npm i firebase`، و `src/lib/firebase/client.ts`، و `.env.local` بالـ config بتاع `founder-fit-6a455`. Test: `npm run dev` من غير errors.
5. **AuthGate + sign-in/out.** Test: على `localhost:3000`، login بـ Google، و refresh يفضل logged in، و sign-out يرجّعك للـ gate.
6. **Firestore rules + indexes** + `firebase.json`/`.firebaserc`، وتعمل deploy (`firebase deploy --only firestore --project founder-fit-6a455`، **بموافقتك**). Test: Rules Playground:
   - owner يعمل create بالـ fields بالظبط → مسموح
   - create فيه field زيادة → مرفوض (`hasOnly`)
   - `context` فيه key غير K1–K10 → مرفوض
   - user تاني يقرا → مرفوض
   - update لـ `ffiScore` → مرفوض
7. **Firestore save بدل Prisma** في `finish()`، ومعاه `context`. Test: تخلّص assessment وتلاقي الـ doc في `users/{uid}/assessments`، وفيه `context` و `narrative: null`.
8. **شيل Prisma + الـ agent skills:** `actions.ts`، و `prisma/`، و `prisma7.config.ts`، والـ deps، و `postinstall`، و `.agents/`، و `.claude/skills/`، و `.windsurf/skills/`، و `skills-lock.json`. Test: `npm ci && npm run build`، و `grep -r prisma src` فاضي.
9. **Narrative route:** `npm i @anthropic-ai/sdk firebase-admin`، والـ route (`claude-sonnet-4-6`)، والـ prompt module، والـ client call، و `updateDoc`. Test:
   - محلياً بـ `ANTHROPIC_API_KEY` الـ narrative يطلع
   - من غير token يرجّع 401
   - `narrative` يتحدّث في الـ doc
10. **`apphosting.yaml` + `engines`.** Test: `npm run build` بـ Node 22.
11. **App Hosting backend** في `us-central1` (Console، قسم 11) + secret + أول rollout. Test: الـ `hosted.app` URL بيفتح.
12. **Authorized domain** للـ `hosted.app`، و smoke test كامل: login، assessment، save، narrative، PDF، والـ autofill **مش ظاهر**.
13. **README.**

**Phase 2 (بعد ما خطوة 12 تنجح):**

14. **صفحة "My assessments":** list بـ `query(collection(db,"users",uid,"assessments"), orderBy("createdAt","desc"))`، و open report محفوظ، و delete. Test: تشوف assessments بتاعتك بس، والـ delete بيمسح من Firestore.

**بعدين (منفصل، L):**

15. نشيل `ignoreBuildErrors`/`ignoreDuringBuilds` ونصلّح الـ TS/ESLint errors.
16. نقسم `page.tsx` (constants/scoring/data/components) من غير ما نغيّر السلوك.

## 11. Firebase Console checklist (بالترتيب)
1. Project `founder-fit-6a455` → Upgrade لـ **Blaze**، وتعمل **budget alert** في GCP Billing.
2. Project settings → Your apps → **Add Web app** → تاخد `apiKey` و `appId` (والـ `authDomain` = `founder-fit-6a455.firebaseapp.com`).
3. Authentication → Get started → Sign-in method → **Google → Enable** + support email.
4. Firestore Database → Create database → **Standard edition** → Location: **`us-central1`** (Regional، مش multi-region، ومينفعش تتغيّر) → **Production mode**.
5. (خطوة 6) Deploy للـ rules، وبعدين تراجع tab الـ Rules + Rules Playground.
6. Anthropic Console: API key مخصوص للمشروع + spend limit.
7. CLI: `firebase apphosting:secrets:set anthropic-api-key --project founder-fit-6a455`.
8. App Hosting → **Create backend**: region **`us-central1`**، و GitHub connect (org approval لو مطلوب)، repo `ScienceWerx-Inc/Founder_Fit`، root `/`، branch `main`، auto rollouts، runtime `nodejs22`، تربطه بالـ Web app.
9. بعد أول rollout: تاخد الـ URL (`<backend-id>--founder-fit-6a455.us-central1.hosted.app`) → Authentication → Settings → **Authorized domains → Add**.

## 12. Risks & open questions
**قرارات اتاخدت (للتوثيق):**
- Project `founder-fit-6a455`، والـ region `us-central1` لـ App Hosting و Firestore (Standard، regional).
- الموديل `claude-sonnet-4-6`، لأن `claude-sonnet-5-5` بيرفض `temperature: 0.3` (قسم 7).
- الـ narrative بيتحفظ، والـ `context` بيتحفظ.
- "My assessments" في Phase 2.
- الـ agent skills بتتمسح مع Prisma.
- مفيش analytics ولا custom domain دلوقتي.
- الـ autofill dev-only.
- Re-score: كل مرة بتعمل **doc جديد**. كده الـ history بيتحفظ، والـ rules بتفضل strict (الـ update مسموح للـ `narrative` بس).
- Retention: زرار الـ delete في Phase 2 كفاية دلوقتي.

**Open questions:** مفيش حالياً. هيتحدّث لو ظهر حاجة في خطوة 0 (الـ build).

**Risks:**
- `firebase` JS SDK بقى **v13.0.0** (major جديد) وما راجعتش الـ breaking changes بتاعته، فهراجع الـ release notes قبل خطوة 4، أو نثبّت version.
- الـ build state ما اتأكدش (مشغلتش build)، وإن Prisma مكسور تحليل من الكود بس.
- شكل دومين `hosted.app` بالظبط: اتأكد منه من الكونسول.
- الـ popup ممكن يتعمله block، فلازم رسالة واضحة لو `auth/popup-blocked`.
- شيل `ignoreBuildErrors` هيطلّع errors كتير، وعشان كده هو خطوة منفصلة.
- تكاليف Blaze (Cloud Run + Cloud Build + Firestore) + Anthropic. الـ `maxInstances: 2` والـ budget alerts بيقللوا المخاطرة.
- GitHub org permissions ممكن تأخر خطوة 11.
- الـ rules بتتطلب الـ fields بالظبط، فأي field جديد في الـ code من غير تحديث الـ rules هيخلي الـ save يفشل (`permission-denied`). لازم يتحدّثوا مع بعض.

**مصادر:**
- https://firebase.google.com/docs/app-hosting/get-started
- https://firebase.google.com/docs/app-hosting/configure
- https://firebase.google.com/docs/app-hosting/frameworks-tooling
- https://firebase.google.com/docs/app-hosting/firebase-sdks
- https://firebase.google.com/docs/auth/web/google-signin
- https://firebase.google.com/docs/auth/web/redirect-best-practices
- https://firebase.google.com/docs/firestore/quotas
- https://firebase.google.com/docs/firestore/manage-data/data-types
- https://firebase.google.com/docs/firestore/security/rules-conditions
- https://platform.claude.com/docs/en/models/sonnet-5-5/migration-guide
- Package versions اتجابت بـ `npm view` في 2026-10-21: firebase 13.0.0، firebase-admin 14.5.0 (node >=22)، firebase-tools 15.34.0، @anthropic-ai/sdk 0.137.0.
