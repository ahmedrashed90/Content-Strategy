import { FIREBASE_CONFIG, FIREBASE_SDK_VERSION } from './config.js';

let firebaseModules;
let auth;
let firestore;

export async function connectFirebase() {
  if (firebaseModules) return { auth, firestore, api: firebaseModules };
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
  const [appSdk, authSdk, dbSdk] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`)
  ]);
  const firebaseApp = appSdk.initializeApp(FIREBASE_CONFIG);
  auth = authSdk.getAuth(firebaseApp);
  firestore = dbSdk.getFirestore(firebaseApp);
  firebaseModules = { authSdk, dbSdk };
  return { auth, firestore, api: firebaseModules };
}

export function listenToAuth(callback) {
  if (!auth) throw Error('Firebase is not initialized');
  return firebaseModules.authSdk.onAuthStateChanged(auth, callback, error => callback(null, error));
}

export async function loginWithEmail(email, password) {
  return firebaseModules.authSdk.signInWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  if (!auth) return;
  return firebaseModules.authSdk.signOut(auth);
}

const ALLOWED_BASELINES = new Set(['baseline-2026-v1', 'baseline-2026-v2']);
export async function getStoredBaseline(baselineId = 'baseline-2026-v2') {
  if (!ALLOWED_BASELINES.has(baselineId)) throw Error('Unsupported baseline ID');
  const { doc, getDoc } = firebaseModules.dbSdk;
  const snapshot = await getDoc(doc(firestore, 'baselines', baselineId));
  return snapshot.exists() ? snapshot.data() : null;
}

// Always creates the new, immutable four-platform record. Never changes v1.
export async function createStoredBaseline(seed, uid) {
  if (seed?.id !== 'baseline-2026-v2' || seed?.schemaVersion !== 2) throw Error('Unexpected seed version');
  const { doc, setDoc, serverTimestamp } = firebaseModules.dbSdk;
  const reference = doc(firestore, 'baselines', 'baseline-2026-v2');
  await setDoc(reference, { ...seed, ownerUid: uid, createdAt: serverTimestamp() });
}
