import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging } from "firebase/messaging";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export the necessary Firebase services
export const auth = getAuth(app);

// Initialize Firestore with offline persistence (Firebase v10+ syntax)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export const storage = getStorage(app);
export const messaging = getMessaging(app);
export const functions = getFunctions(app);

// Connect to Firebase Functions emulator if running locally AND emulator is available
if (import.meta.env.DEV) {
  // For now, use production Cloud Functions directly
  // Uncomment below to use local emulator when it's running:
  /*
  try {
    connectFunctionsEmulator(functions, "localhost", 5001);
  } catch (error) {
    console.log('Functions emulator connection skipped - using production functions');
  }
  */
  console.log('Using production Cloud Functions in development mode');
}

console.log('✅ Firebase initialized with offline persistence');

export default app;
