"use client";
import { useState } from "react";

async function mutate(endpoint: "login" | "logout", body: object) {
  const csrfResponse = await fetch("/api/admin/auth/csrf", { cache: "no-store" });
  const csrf = await csrfResponse.json();
  if (!csrfResponse.ok || !csrf.data?.csrfToken) throw new Error("Admin sign-in is unavailable. Try again shortly.");
  const response = await fetch(`/api/admin/auth/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.data.csrfToken }, body: JSON.stringify(body), cache: "no-store" });
  await response.json();
  if (!response.ok) {
    if (endpoint === "logout" && response.status === 401) return;
    throw new Error(response.status === 401 ? "Invalid email or password." : response.status === 429 ? "Too many sign-in attempts. Try again in 15 minutes." : "Your request could not be completed. Refresh and try again.");
  }
}
export function LoginForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <form className="admin-form" onSubmit={async event => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError("");
    try {
      await mutate("login", { email: String(data.get("email") || "").trim(), password: String(data.get("password") || "") });
      // A full navigation discards any previously cached private router state.
      window.location.replace("/admin");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in is unavailable. Try again.");
      const password = form.elements.namedItem("password") as HTMLInputElement;
      password.value = "";
      setBusy(false);
      requestAnimationFrame(() => password.focus());
    }
  }}>
    <label htmlFor="email">Email address</label>
    <input id="email" name="email" type="email" autoComplete="username" maxLength={254} required disabled={busy} />
    <label htmlFor="password">Password</label>
    <input id="password" name="password" type="password" autoComplete="current-password" maxLength={128} required disabled={busy} aria-describedby={error ? "login-error" : undefined} />
    {error && <p id="login-error" role="alert" className="admin-error">{error}</p>}
    <button className="admin-button" disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</button>
  </form>;
}
export function LogoutButton() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <div><button className="admin-button admin-button-secondary" disabled={busy} onClick={async () => {
    setBusy(true); setError("");
    try { await mutate("logout", {}); window.location.replace("/admin/login"); }
    catch { setError("Could not sign out. Try again."); setBusy(false); }
  }}>{busy ? "Signing out…" : "Sign out"}</button>{error && <p role="alert" className="admin-error">{error}</p>}</div>;
}
