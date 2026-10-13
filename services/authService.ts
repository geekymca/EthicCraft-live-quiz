import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User as FirebaseUser 
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from './firebaseService';

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export const signInWithGoogle = async (): Promise<UserProfile> => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    const profile: UserProfile = {
      uid: user.uid,
      displayName: user.displayName || user.email?.split('@')[0] || 'Seeker',
      email: user.email,
      photoURL: user.photoURL,
    };

    // Store in localStorage for fast hydration
    try {
      localStorage.setItem('firebase_auth_user', JSON.stringify(profile));
    } catch (e) {
      console.warn("Could not save to localStorage", e);
    }

    // Save profile to Firestore
    try {
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email || '',
        displayName: profile.displayName || '',
        photoURL: user.photoURL || '',
        createdAt: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      console.warn("Could not save profile to firestore", err);
    }

    return profile;
  } catch (error: any) {
    console.error("Google sign-in error:", error);
    throw error;
  }
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
      const profile: UserProfile = {
        uid: firebaseUser.uid,
        displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Seeker',
        email: firebaseUser.email,
        photoURL: firebaseUser.photoURL,
      };
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
