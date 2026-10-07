"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user, password }),
    });
    setPending(false);
    if (!response.ok) {
      setError("Those credentials were not accepted.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="login">
      <h1>Taxes</h1>
      <p>Sign in to the return worksheet. This site is not public.</p>
      <form onSubmit={onSubmit}>
        <label>
          Username
          <input
            autoComplete="username"
            value={user}
            onChange={(event) => setUser(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
