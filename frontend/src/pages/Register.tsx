import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useBrandingStore } from "@/store/brandingStore";
import ParticleNetwork from "@/components/common/ParticleNetwork";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState("");
  const register = useAuthStore((s) => s.register);
  const error = useAuthStore((s) => s.error);
  const isLoading = useAuthStore((s) => s.isLoading);
  const appName = useBrandingStore((s) => s.appName);
  const appDescription = useBrandingStore((s) => s.appDescription);
  const registrationMode = useBrandingStore((s) => s.registrationMode);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError("");
    if (password !== confirmPassword) {
      setLocalError("Passwords do not match");
      return;
    }
    try {
      await register(username, password, {
        email: email || undefined,
        displayName: displayName || undefined,
      });
      navigate("/");
    } catch {
      // error is set in store
    }
  };

  const displayError = localError || error;
  const isClosed = registrationMode !== "open";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 relative overflow-hidden">
      <ParticleNetwork />

      <div className="w-full max-w-md px-4 relative z-10 py-8">
        {/* Logo / Icon */}
        <div className="flex justify-center mb-8 animate-fade-in-up">
          <div className="animate-float">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-accent to-brand flex items-center justify-center shadow-lg shadow-brand-accent/20">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl shadow-2xl shadow-black/40 border border-gray-800/50 p-8 animate-fade-in-up delay-100">
          <h1 className="text-2xl font-bold text-white mb-1 text-center animate-fade-in delay-200">
            Create your account
          </h1>
          <p className="text-sm text-gray-400 text-center mb-8 animate-fade-in delay-300">
            Join {appName} today
          </p>

          {isClosed && (
            <div className="mb-6 p-3 bg-red-900/30 border border-red-800/50 rounded-xl text-red-300 text-sm animate-fade-in">
              {registrationMode === "closed"
                ? "Registration is currently closed."
                : "Registration is invite-only. You need an invitation to create an account."}
            </div>
          )}

          {!isClosed && (
            <div className="mb-6 p-3 bg-amber-900/20 border border-amber-800/30 rounded-xl text-amber-300/80 text-xs flex items-start gap-2 animate-fade-in delay-300">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <span>
                Your encryption keys are stored only on this device. If you lose
                access to this device, you cannot recover your message history.
              </span>
            </div>
          )}

          {displayError && (
            <div className="mb-6 p-3 bg-red-900/30 border border-red-800/50 rounded-xl text-red-300 text-sm animate-fade-in">
              {displayError}
            </div>
          )}

          {!isClosed && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="animate-fade-in-up delay-300">
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Username <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input-glow w-full px-4 py-2.5 bg-gray-800/50 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand/50 transition-all duration-300"
                  placeholder="Choose a username"
                  pattern="^[a-zA-Z0-9_-]+$"
                  minLength={3}
                  maxLength={64}
                  required
                />
                <p className="mt-1 text-xs text-gray-600">
                  Letters, numbers, hyphens, and underscores only
                </p>
              </div>

              <div className="animate-fade-in-up delay-400">
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="input-glow w-full px-4 py-2.5 bg-gray-800/50 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand/50 transition-all duration-300"
                  placeholder="How others will see you"
                  maxLength={64}
                />
              </div>

              <div className="animate-fade-in-up delay-400">
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-glow w-full px-4 py-2.5 bg-gray-800/50 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand/50 transition-all duration-300"
                  placeholder="Optional - for account recovery"
                />
              </div>

              <div className="animate-fade-in-up delay-500">
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Password <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-glow w-full px-4 py-2.5 bg-gray-800/50 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand/50 transition-all duration-300"
                  placeholder="Minimum 8 characters"
                  minLength={8}
                  required
                />
              </div>

              <div className="animate-fade-in-up delay-500">
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Confirm Password <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-glow w-full px-4 py-2.5 bg-gray-800/50 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand/50 transition-all duration-300"
                  placeholder="Re-enter your password"
                  minLength={8}
                  required
                />
              </div>

              <div className="animate-fade-in-up delay-600 pt-1">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 bg-gradient-to-r from-brand-accent to-teal-600 hover:from-teal-600 hover:to-brand-accent disabled:opacity-50 disabled:hover:from-brand-accent disabled:hover:to-teal-600 text-white rounded-xl font-medium transition-all duration-300 hover:shadow-lg hover:shadow-brand-accent/25 hover:scale-[1.02] active:scale-[0.98]"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Creating account...
                    </span>
                  ) : (
                    "Create Account"
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer link */}
        <p className="mt-6 text-center text-sm text-gray-500 animate-fade-in delay-600">
          Already have an account?{" "}
          <Link
            to="/login"
            className="text-brand hover:text-blue-400 transition-colors duration-200"
          >
            Sign in
          </Link>
        </p>

        {/* App description */}
        <p className="mt-3 text-center text-xs text-gray-600 animate-fade-in delay-700">
          {appDescription}
        </p>
      </div>
    </div>
  );
}
