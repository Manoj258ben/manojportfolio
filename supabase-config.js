/* ============================================
   SUPABASE CONFIGURATION — supabase-config.js
   Shared Supabase client initialization.
   Replace the placeholders with your Supabase
   project URL and publishable anon key.
   NEVER put the service-role key here.
   ============================================ */

// ── Your Supabase project values (Dashboard -> Project Settings -> API) ──
// The anon / publishable key is SAFE in browser code: it can only do what
// your Row Level Security + Storage policies (schema.sql) allow.
const SUPABASE_URL = 'https://kgpfdtnezsilqehiescv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtncGZkdG5lenNpbHFlaGllc2N2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNTAzMzQsImV4cCI6MjEwNzYyNjMzNH0.Rslpw27pCYcFLfI6L9v-gE5Mze2HtE1gPM5fowhvuBU';

// ── Is the config filled in? ──
const SUPABASE_CONFIGURED =
  /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(SUPABASE_URL) &&
  SUPABASE_ANON_KEY.length > 40 &&
  !/YOUR_/i.test(SUPABASE_URL + SUPABASE_ANON_KEY);

// ── Initialize the Supabase client ONCE (shared by script.js and admin.js) ──
// If the CDN script failed to load (offline / blocked) we expose a clear
// error instead of crashing every page with "supabase is not defined".
let _supabase = null;
try {
  _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
} catch (err) {
  console.error('Supabase client could not be created:', err);
}

/** Name of the Storage bucket used for all uploads. */
const STORAGE_BUCKET = 'portfolio-assets';

/**
 * Helper: get the current authenticated user (or null).
 */
async function getUser() {
  const { data: { user } } = await _supabase.auth.getUser();
  return user;
}

/**
 * Helper: sign in with email / password.
 */
async function signIn(email, password) {
  return _supabase.auth.signInWithPassword({ email, password });
}

/**
 * Helper: sign out.
 */
async function signOut() {
  return _supabase.auth.signOut();
}

/**
 * Helper: send a password reset email.
 */
async function resetPassword(email) {
  return _supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  });
}

/**
 * Helper: update user password (after reset link).
 */
async function updatePassword(newPassword) {
  return _supabase.auth.updateUser({ password: newPassword });
}

/**
 * Helper: listen for auth state changes.
 */
function onAuthStateChange(callback) {
  return _supabase.auth.onAuthStateChange(callback);
}

/**
 * Helper: get a public URL from Supabase Storage.
 */
function getPublicUrl(bucket, path) {
  const { data } = _supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || '';
}

/**
 * Helper: upload file to Supabase Storage.
 * Uses unique file names (never overwrites), so upsert stays off and only
 * the INSERT storage policy is needed.
 */
async function uploadFile(bucket, path, file) {
  return _supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type
  });
}

/**
 * Helper: remove file from Supabase Storage.
 */
async function removeFile(bucket, paths) {
  return _supabase.storage.from(bucket).remove(paths);
}
