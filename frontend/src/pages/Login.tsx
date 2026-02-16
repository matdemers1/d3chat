import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useBrandingStore } from "@/store/brandingStore";
import ParticleNetwork from "@/components/common/ParticleNetwork";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const login = useAuthStore((s) => s.login);
  const error = useAuthStore((s) => s.error);
  const isLoading = useAuthStore((s) => s.isLoading);
  const appName = useBrandingStore((s) => s.appName);
  const appDescription = useBrandingStore((s) => s.appDescription);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await login(username, password);
      navigate("/");
    } catch {
      // error is set in store
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 relative overflow-hidden">
      <ParticleNetwork />

      <div className="w-full max-w-md px-4 relative z-10">
        {/* Logo / Icon */}
        <div className="flex justify-center mb-8 animate-fade-in-up">
          <div className="animate-float">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand to-brand-accent flex items-center justify-center shadow-lg shadow-brand/20">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl shadow-2xl shadow-black/40 border border-gray-800/50 p-8 animate-fade-in-up delay-100">
          <h1 className="text-2xl font-bold text-white mb-1 text-center animate-fade-in delay-200">
            Welcome back
          </h1>
          <p className="text-sm text-gray-400 text-center mb-8 animate-fade-in delay-300">
            Sign in to {appName}
          </p>

          {error && (
            <div className="mb-6 p-3 bg-red-900/30 border border-red-800/50 rounded-xl text-red-300 text-sm animate-fade-in">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="animate-fade-in-up delay-300">
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-glow w-full px-4 py-2.5 bg-gray-800/50 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand/50 transition-all duration-300"
                placeholder="Enter your username"
                required
              />
            </div>

            <div className="animate-fade-in-up delay-400">
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-glow w-full px-4 py-2.5 bg-gray-800/50 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-brand/50 transition-all duration-300"
                placeholder="Enter your password"
                required
              />
            </div>

            <div className="animate-fade-in-up delay-500">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 bg-gradient-to-r from-brand to-blue-600 hover:from-blue-600 hover:to-brand disabled:opacity-50 disabled:hover:from-brand disabled:hover:to-blue-600 text-white rounded-xl font-medium transition-all duration-300 hover:shadow-lg hover:shadow-brand/25 hover:scale-[1.02] active:scale-[0.98]"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Signing in...
                  </span>
                ) : (
                  "Sign In"
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Footer link */}
        <p className="mt-6 text-center text-sm text-gray-500 animate-fade-in delay-600">
          Don't have an account?{" "}
          <Link
            to="/register"
            className="text-brand hover:text-blue-400 transition-colors duration-200"
          >
            Create one
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
