# Implementation Plan: Fix Firebase Deployment Blank Screen & Firestore Database Configuration

Resolve the runtime errors preventing the application from loading when deployed to Firebase Hosting (`sankalp-7b250.web.app`).

---

## 1. Problem Diagnostics & Root Cause Analysis

### Error 1: `Error: An API Key must be set when running in a browser` (Blank Screen)
* **Root Cause**: `services/geminiService.ts` currently instantiates `new GoogleGenAI({ apiKey: process.env.API_KEY })` at the top level of the module upon bundle load.
* When deployed on Firebase Hosting without a build-time `GEMINI_API_KEY` environment variable, `process.env.API_KEY` evaluates to `undefined`.
* The `@google/genai` constructor throws an unhandled exception immediately upon script evaluation, crashing the entire React app before root render and leaving a blank white screen.

### Error 2: `Database '(default)' not found`
* **Root Cause**: In `services/firebaseService.ts`, Firestore is initialized via `getFirestore(app)` without specifying the database ID.
* The provisioned Firestore database ID in this project is `ai-studio-bhagavadgitaquiz-d263554e-f461-4092-a601-1975608e6a06` (configured in `firebase-applet-config.json` as `firestoreDatabaseId`).
* Calling `getFirestore(app)` defaults to `(default)`, which does not exist in this project.
* On application boot, `testConnection()` attempts to connect to `(default)` and logs failed network requests (`net::ERR_FAILED`).

---

## 2. Proposed Changes

### 1. `services/geminiService.ts`: Lazy & Resilient Initialization
- Remove top-level `new GoogleGenAI(...)` instantiation.
- Initialize `GoogleGenAI` dynamically inside `generateQuizQuestions(topic)` only when the user explicitly clicks the "GENERATE WITH AI" button.
- Check for `apiKey`: if absent, display a friendly toast/notification explaining that AI questions require `GEMINI_API_KEY`, but allow all manual quiz editing, JSON import, live play, and Firebase Auth to continue working without crashing the app.

### 2. `services/firebaseService.ts`: Pass Custom Firestore Database ID
- Update `getFirestore(app)` to:
  ```ts
  export const db = firebaseConfig.firestoreDatabaseId
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);
  ```
- Update `testConnection()` to query the correct database instance, preventing `(default) not found` errors.

### 3. Build & Compilation Verification
- Run `compile_applet` to verify clean build without TypeScript or bundling issues.
- Verify production build output (`npm run build`) generates properly for Firebase deployment.

---

## 3. Verification Plan
1. Compile applet without errors.
2. Confirm app loads cleanly without requiring a `GEMINI_API_KEY` to be set in the browser environment.
3. Confirm Firestore connects to `ai-studio-bhagavadgitaquiz-d263554e-f461-4092-a601-1975608e6a06` without errors.
