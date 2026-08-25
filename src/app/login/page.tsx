"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Compass } from "lucide-react";

import { Button, Field, Input } from "@/components/ui/primitives";
import { api, errorMessage, isApiError } from "@/lib/api";
import { cx } from "@/lib/format";

type Mode = "signin" | "register";

interface AuthResponse {
  user: { id: string; email: string; name: string };
}

/**
 * Sign in, or create an account, in one form.
 *
 * Two modes rather than two pages because the fields are nearly identical and
 * people routinely arrive at the wrong one. Switching keeps what has already
 * been typed.
 */
function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const switchMode = (value: Mode) => {
    setMode(value);
    setError(null);
    setFieldErrors({});
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    setFieldErrors({});

    try {
      const path = mode === "signin" ? "/api/auth/login" : "/api/auth/register";
      const body =
        mode === "signin"
          ? { email, password }
          : { email, password, name: name.trim() || undefined };

      await api.post<AuthResponse>(path, body);

      // A full navigation, not router.push: the middleware has to see the new
      // cookie, and the shell needs to re-read who is signed in.
      window.location.assign(next.startsWith("/") ? next : "/");
    } catch (caught) {
      if (isApiError(caught)) setFieldErrors(caught.fieldErrors);
      setError(errorMessage(caught, "Could not sign you in. Try again."));
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span
            aria-hidden
            className="flex h-11 w-11 items-center justify-center rounded-xl text-accent-text"
            style={{ backgroundImage: "linear-gradient(135deg, var(--accent), var(--amber))" }}
          >
            <Compass className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">Curated</h1>
            <p className="mt-1 text-sm text-muted">
              {mode === "signin"
                ? "Sign in to your playlists and watchlists."
                : "Create an account to start curating."}
            </p>
          </div>
        </div>

        <div
          className="mb-5 grid grid-cols-2 gap-0.5 rounded-lg border border-line p-0.5"
          role="tablist"
          aria-label="Account"
        >
          {(["signin", "register"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => switchMode(value)}
              className={cx(
                "rounded-md py-1.5 text-sm font-medium transition-colors",
                mode === value ? "bg-surface-hover text-ink" : "text-subtle hover:text-ink",
              )}
            >
              {value === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4" noValidate>
          {mode === "register" ? (
            <Field label="Name" hint="Optional." htmlFor="name">
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                placeholder="Your name"
                disabled={busy}
              />
            </Field>
          ) : null}

          <Field label="Email" htmlFor="email" required error={fieldErrors.email}>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              required
              invalid={Boolean(fieldErrors.email)}
              disabled={busy}
            />
          </Field>

          <Field
            label="Password"
            htmlFor="password"
            required
            error={fieldErrors.password}
            hint={mode === "register" ? "At least 8 characters." : undefined}
          >
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder="••••••••"
              required
              invalid={Boolean(fieldErrors.password)}
              disabled={busy}
            />
          </Field>

          {error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs leading-relaxed text-danger"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            className="w-full justify-center"
            loading={busy}
            disabled={busy}
          >
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs leading-relaxed text-subtle">
          Everything you save stays in your own database. Nothing is shared with anyone else.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary to keep the route prerenderable.
  return (
    <Suspense fallback={<div className="min-h-dvh bg-bg" />}>
      <LoginForm />
    </Suspense>
  );
}
