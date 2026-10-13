import { 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signOut, 
  onAuthStateChanged, 
  User as FirebaseUser 
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, googleProvider, db, firebaseConfig } from './firebaseService';

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

const formatUserProfile = (user: FirebaseUser): UserProfile => {
  return {
    uid: user.uid,
    displayName: user.displayName || user.email?.split('@')[0] || 'Seeker',
    email: user.email,
    photoURL: user.photoURL,
  };
};

const persistUserProfile = async (profile: UserProfile) => {
  try {
    localStorage.setItem('firebase_auth_user', JSON.stringify(profile));
  } catch (e) {
    console.warn("Could not save to localStorage", e);
  }

  try {
    await setDoc(doc(db, 'users', profile.uid), {
      uid: profile.uid,
      email: profile.email || '',
      displayName: profile.displayName || '',
      photoURL: profile.photoURL || '',
      createdAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn("Could not save profile to firestore", err);
  }
};

export const signInWithGoogle = async (): Promise<UserProfile> => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const profile = formatUserProfile(result.user);
    await persistUserProfile(profile);
    return profile;
  } catch (error: any) {
    console.error("Google popup sign-in error:", error);
    
    // If popup was blocked by browser, attempt redirect
    if (error?.code === 'auth/popup-blocked') {
      console.info("Popup blocked; falling back to signInWithRedirect...");
      await signInWithRedirect(auth, googleProvider);
      throw error;
    }

    throw error;
  }
};

export const signInWithGoogleRedirect = async (): Promise<void> => {
  await signInWithRedirect(auth, googleProvider);
};

export const checkRedirectAuth = async (): Promise<UserProfile | null> => {
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      const profile = formatUserProfile(result.user);
      await persistUserProfile(profile);
      return profile;
    }
  } catch (error) {
    console.warn("Error getting redirect auth result:", error);
  }
  return null;
};

export const signOutUser = async (): Promise<void> => {
  try {
    await signOut(auth);
    localStorage.removeItem('firebase_auth_user');
  } catch (error) {
    console.error("Sign-out error:", error);
    throw error;
  }
};

export const subscribeToAuth = (callback: (user: UserProfile | null) => void) => {
  return onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
    if (firebaseUser) {
      const profile = formatUserProfile(firebaseUser);
      localStorage.setItem('firebase_auth_user', JSON.stringify(profile));
      callback(profile);
    } else {
      localStorage.removeItem('firebase_auth_user');
      callback(null);
    }
  });
};

export const getStoredAuthUser = (): UserProfile | null => {
  try {
    const saved = localStorage.getItem('firebase_auth_user');
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
};

export const getAuthErrorMessage = (error: any): { title: string; message: string; fixStep?: string } => {
  const code = error?.code || '';
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'your-domain';

  switch (code) {
    case 'auth/unauthorized-domain':
      return {
        title: "Domain Not Authorized in Firebase",
        message: `The domain "${currentHost}" is not added to Authorized Domains for Firebase Project "${firebaseConfig.projectId}".`,
        fixStep: `In Firebase Console -> Authentication -> Settings -> Authorized domains, click "Add domain" and enter "${currentHost}".`
      };
    case 'auth/operation-not-allowed':
      return {
        title: "Google Sign-In Disabled",
        message: `Google provider is not enabled in Firebase project "${firebaseConfig.projectId}".`,
        fixStep: `In Firebase Console -> Authentication -> Sign-in method, click "Google", enable it, and click Save.`
      };
    case 'auth/popup-blocked':
      return {
        title: "Popup Blocked by Browser",
        message: "Your browser or device blocked the Google login popup.",
        fixStep: "Click 'Try Redirect Sign-In' below, or allow popups in your browser settings."
      };
    case 'auth/popup-closed-by-user':
      return {
        title: "Sign-In Cancelled",
        message: "The Google sign-in window was closed before completing."
      };
    case 'auth/network-request-failed':
      return {
        title: "Network Connection Error",
        message: "Failed to connect to Google authentication servers. Please check your internet connection."
      };
    default:
      return {
        title: "Sign-In Error",
        message: error?.message || "Could not complete Google sign-in.",
        fixStep: code ? `Error Code: ${code}` : undefined
      };
  }
};
