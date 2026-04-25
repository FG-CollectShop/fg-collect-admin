import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { firebaseConfigured, signInWithGoogle } from "@/firebase";

export function LoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (auth.status === "signed-in") {
    const dest = (location.state as { from?: string } | null)?.from ?? "/sets";
    return <Navigate to={dest} replace />;
  }

  async function handleSignIn() {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-lg p-8 shadow-sm">
        <h1 className="text-xl font-bold tracking-tight">FG-Collect Admin</h1>
        <p className="mt-2 text-sm text-gray-600">Staff sign-in. Allowed accounts only.</p>

        {!firebaseConfigured && (
          <div className="mt-4 p-3 text-xs bg-amber-50 border border-amber-200 rounded text-amber-900">
            Firebase isn't configured for this build. Set <code>VITE_FIREBASE_*</code> in
            <code className="mx-1">.env.local</code> and restart Vite.
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 text-xs bg-red-50 border border-red-200 rounded text-red-900">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleSignIn}
          disabled={!firebaseConfigured || busy || auth.status === "loading"}
          className="mt-6 w-full px-4 py-2.5 bg-black text-white text-sm font-medium rounded-md hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "Opening Google sign-in…" : "Continue with Google"}
        </button>
      </div>
    </div>
  );
}
