import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { authenticate, getCurrentUserEmail, isAuthenticated } from "@/lib/auth";

export default function Login() {
  const navigate = useNavigate();
  const currentUserEmail = getCurrentUserEmail();
  const [email, setEmail] = useState(currentUserEmail ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  if (isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const result = authenticate(email, password);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground">Mini MEE Login</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in with your email. New emails are created automatically.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="Enter your password"
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <button
            type="submit"
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
