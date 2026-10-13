# Implementation Plan: Firebase Google Authentication Integration

Integrate real Firebase Authentication with Google Sign-In for participants, maintain guest entry fallback, and keep the existing Supabase real-time database intact.

---

## 1. User Decisions & Architectural Alignment
* **Authentication Scope**: Real Google Sign-In for participants via Firebase Auth (`signInWithPopup`), with seamless fallback to guest entry (manual Name + ID) for participants who prefer not to sign in.
* **Database & Realtime Sync**: Maintain existing Supabase real-time database for rooms, participants, questions, and live score sync as selected.
* **Hosting & Deployment Ready**: Configured for deployment to Firebase Hosting or custom domains.

---

## 2. Proposed Architecture & Workflow

```
[ Participant Client ]
       │
       ├── Google Sign-In (Firebase Auth) ─────────► Firebase Authentication (OAuth)
       │       │ (extracts name, email, avatar, UID)
       │       ▼
       └── Join Room / Live Score Sync ───────────► Supabase Database (Real-time WebSockets & Polling)
```

1. **Firebase Setup & Provisioning**:
   - Provision Firebase using the AI Studio Firebase setup flow (`ui_type: "firebase_setup"`).
   - Add `firebase` client SDK package.
   - Initialize Firebase client service (`services/firebaseService.ts`) reading configuration from `firebase-applet-config.json`.

2. **Google Auth Service (`services/authService.ts`)**:
   - `signInWithGoogle()`: Launches Firebase Google popup auth.
   - `signOutUser()`: Clears auth session.
   - `onAuthChange(callback)`: Real-time listener for auth state changes.
   - Auto-extracts player's display name, profile photo avatar, and email to pre-fill participant details.

3. **Participant View Updates (`components/ParticipantView.tsx`)**:
   - Replace the prompt-based stub with a real Google Sign-In button adhering to Google Identity design guidelines.
   - When signed in with Google:
     - Displays profile chip with Google avatar, verified name, and email.
     - Auto-populates participant name and derives clean participant ID.
     - Offers "Sign out / Use another account" button.
   - Guest fallback remains accessible for any user who wants to join by manually typing Name and ID without a Google account.
   - Header shows user avatar and Google connection status during active quiz play.

4. **Safety & Backward Compatibility**:
   - Existing room codes, scoring logic, 3D animations, and Supabase real-time sync will remain unaffected.
   - Rejoining sessions will recognize both Google UID and Roll Number.

---

## 3. Step-by-Step Execution Plan

### Step 1: Firebase Provisioning & Dependencies
- Launch AI Studio Firebase UI to establish project credentials.
- Install `firebase` npm package (`install_applet_package`).
- Create `services/firebaseService.ts` to export initialized `auth` and `googleProvider`.

### Step 2: Authentication Layer
- Create `services/authService.ts` with helper methods:
  - `loginWithGoogle()`
  - `logout()`
  - `getCurrentUser()`
  - `subscribeToAuthChanges()`

### Step 3: UI Enhancement in `ParticipantView.tsx`
- Replace mock prompt with real Google Sign-In button.
- Add authenticated profile card with user avatar and email.
- Preserve full guest entry form with one-click toggle.
- Sync authenticated user details to `localStorage` and Supabase participant record.

### Step 4: Verification & Build
- Verify clean compilation (`compile_applet`).
- Test Google popup trigger and guest fallback flow.
