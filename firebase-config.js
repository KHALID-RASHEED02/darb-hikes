/**
 * درب (Darb) — Firebase v10 Modular CDN Configuration
 * Compatible with static hosting (GitHub Pages, Netlify, Cloudflare Pages) & Vite.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDocFromServer,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';

/**
 * Replace this email with your own Super Admin email address.
 * Accounts signing in with this verified email automatically receive "superadmin" privileges.
 */
export const SUPER_ADMIN_EMAIL = 'az208345@gmail.com';

// Additional bootstrapped owner email configured for this workspace environment
const BOOTSTRAP_ADMIN_EMAILS = [SUPER_ADMIN_EMAIL.toLowerCase(), 'az208345@gmail.com'];

/**
 * Paste your Firebase Web App credentials below if deploying to a different Firebase project:
 * Firebase Console -> Project Settings -> General -> Your apps -> SDK setup and configuration
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyCr7aAPzPjgpUoACNX8E7PRn3-KtEcLSno', // Replace with your Firebase apiKey
  authDomain: 'amazing-welder-wklwk.firebaseapp.com', // Replace with your Firebase authDomain
  projectId: 'amazing-welder-wklwk', // Replace with your Firebase projectId
  storageBucket: 'amazing-welder-wklwk.firebasestorage.app', // Replace with your Firebase storageBucket
  messagingSenderId: '132471958254', // Replace with your Firebase messagingSenderId
  appId: '1:132471958254:web:0f8af9532f954124a9a1ff', // Replace with your Firebase appId
  // Optional: Named Firestore database ID (leave as "(default)" for standard Firebase projects)
  firestoreDatabaseId: 'ai-studio-e997ffc3-76f9-4c6a-b9a5-707f4cf01d5c',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);
export const storage = getStorage(app);

export function isConfiguredSuperAdminEmail(email) {
  if (!email) return false;
  return BOOTSTRAP_ADMIN_EMAILS.includes(String(email).trim().toLowerCase());
}

/**
 * Structured Firestore Operation Types & Error Reporting
 */
export const OperationType = Object.freeze({
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
});

export function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Startup connectivity validation against Firestore
 */
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration in firebase-config.js.');
    }
  }
}

if (typeof window !== 'undefined') {
  testConnection();
}
