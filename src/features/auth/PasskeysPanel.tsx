"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "./authErrors";
import { FormMessage, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, TextField } from "./AuthUi";

export default function PasskeysPanel() {
  const { data: passkeys, isPending, error: listError, refetch } = authClient.useListPasskeys();
  const [name, setName] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setInfo(null);
    if (!window.isSecureContext || !window.PublicKeyCredential) {
      setError("Passkeys aren't supported in this browser. Try an up-to-date browser on a secure connection.");
      return;
    }
    setPending("add");
    try {
      const result = await authClient.passkey.addPasskey({ name: name.trim() || "My passkey" });
      if (result?.error) {
        setError("code" in result.error && (result.error.code === "SESSION_EXPIRED" || result.error.code === "SESSION_NOT_FRESH")
          ? "Sign out, then sign in again before adding a passkey."
          : authErrorMessage(result.error));
      } else if (result?.data) {
        setName("");
        setInfo("Passkey added. You can now use it to sign in on this site.");
      } else {
        setError("Passkey setup wasn't completed. Try again.");
      }
    } catch {
      setError(authErrorMessage(null));
    } finally {
      setPending(null);
    }
  }

  async function remove(id: string) {
    if (pending || !window.confirm("Remove this passkey? Keep access to Google or another sign-in method before removing it.")) return;
    setPending(id);
    setError(null);
    setInfo(null);
    try {
      const result = await authClient.passkey.deletePasskey({ id });
      if (result.error) setError(authErrorMessage(result.error));
      else setInfo("Passkey removed.");
    } catch {
      setError(authErrorMessage(null));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[color:var(--foreground-muted)]">Sign in with your fingerprint, face, device PIN, or a security key. Passkeys are tied to this site&apos;s domain. Keep Google or another sign-in method available for recovery.</p>
      <FormMessage tone="error">{error ?? (listError ? "We couldn't load your passkeys. Try again." : null)}</FormMessage>
      <FormMessage tone="info">{info}</FormMessage>
      {listError ? <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={() => void refetch()}>Reload passkeys</button> : null}
      {isPending ? <p role="status">Loading passkeys…</p> : null}
      {passkeys?.length === 0 ? <p className="text-sm">No passkeys added yet.</p> : null}
      {passkeys?.length ? (
        <ul className="space-y-3">
          {passkeys.map((passkey) => (
            <li key={passkey.id} className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-sm font-semibold">{passkey.name || "Passkey"}</p>
                {passkey.createdAt ? <p className="text-xs text-[color:var(--foreground-muted)]">Added {new Date(passkey.createdAt).toLocaleDateString()}</p> : null}
              </div>
              <button type="button" className={SECONDARY_BUTTON_CLASS} disabled={pending !== null}
                aria-label={`Remove ${passkey.name || "passkey"}`} onClick={() => void remove(passkey.id)}>
                {pending === passkey.id ? "Removing…" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={add} className="space-y-3">
        <TextField label="Passkey name" name="passkey-name" placeholder="e.g. My phone" maxLength={80}
          value={name} onChange={(event) => setName(event.target.value)} disabled={pending !== null} />
        <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={pending !== null} aria-busy={pending === "add"}>
          {pending === "add" ? "Follow your device's instructions…" : "Add a passkey"}
        </button>
      </form>
    </div>
  );
}
