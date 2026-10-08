import { useEffect, useState } from "react";
import { Dialog } from "./Dialog";
import { TextField } from "./Fields";

interface Props {
  open: boolean;
  reason: string;
  onClose: () => void;
  onSubmit: (mode: "register" | "login", email: string, password: string) => Promise<void>;
}

export function AuthDialog({ open, reason, onClose, onSubmit }: Props) {
  const [mode, setMode] = useState<"register" | "login">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setError("");
  }, [open, mode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(mode, email.trim(), password);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const signup = mode === "register";
  return (
    <Dialog open={open} title={signup ? "Create your account" : "Sign in"} onClose={onClose}>
      <p className="muted">{reason}</p>
      <form onSubmit={submit} noValidate>
        <TextField label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={setEmail} />
        <TextField
          label="Password"
          type="password"
          autoComplete={signup ? "new-password" : "current-password"}
          value={password}
          onChange={setPassword}
          hint={signup ? "At least 10 characters." : undefined}
        />
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="actions">
          <button className="btn btn-primary" type="submit" disabled={busy || !email || !password} aria-busy={busy}>
            {busy ? <span className="spinner" aria-hidden="true" /> : null}
            {signup ? "Create account" : "Sign in"}
          </button>
          <button type="button" className="link-btn" onClick={() => setMode(signup ? "login" : "register")}>
            {signup ? "I already have an account" : "Create an account instead"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
