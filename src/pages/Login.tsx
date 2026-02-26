import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, signup, authReadyPromise, getCurrentUserEmail } from "@/lib/auth";

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    authReadyPromise
      .then(() => {
        const e = getCurrentUserEmail();
        setCurrentUserEmail(e);
        if (e) setEmail(e);
      })
      .catch(() => {
        // Auth initialization failed; continue with no pre-filled email.
      });
  }, []);

  const switchMode = (next: "login" | "signup") => {
    setMode(next);
    setError("");
    setInfo("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setInfo("");
    setIsSubmitting(true);

    const result = mode === "login"
      ? await login(email, password)
      : await signup(email, password, accessCode);

    if (!result.ok) {
      setError(result.error);
      setIsSubmitting(false);
      return;
    }

    if (result.mode === "confirm") {
      setInfo("Account created! Check your email to confirm your account before signing in.");
      setIsSubmitting(false);
      return;
    }

    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-background px-4">
      <div className="relative w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="pointer-events-none absolute -top-20 right-0">
          <img src="/serc-robot-transparent.png" alt="SERC Robot" className="h-40 w-40 object-contain" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Mini MEE Login</h1>
        {currentUserEmail ? (
          <p className="mt-1 text-xs text-muted-foreground">Currently signed in as {currentUserEmail}. You can switch accounts below.</p>
        ) : null}

        <div className="mt-4 flex rounded-md border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => switchMode("login")}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === "login" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => switchMode("signup")}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === "signup" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
          >
            Create account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="Enter your password"
            />
          </div>

          {mode === "signup" && (
            <div>
              <label htmlFor="accessCode" className="block text-sm font-medium text-foreground mb-1">
                One-Time Access Code
              </label>
              <input
                id="accessCode"
                type="text"
                required
                autoComplete="off"
                value={accessCode}
                onChange={(event) => setAccessCode(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder="Enter code from spaceroboticscreations@outlook.com"
              />
            </div>
          )}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {info ? <p className="text-sm text-green-600">{info}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {isSubmitting ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
