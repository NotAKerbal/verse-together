"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faKey, faPlus } from "@fortawesome/free-solid-svg-icons";
import { authClient } from "@/lib/auth-client";
import { reauthenticationHref } from "@/lib/signInFlow";
import styles from "@/app/account/page.module.css";
import { needsReauthentication } from "./accountLists";
import { authErrorMessage } from "./authErrors";
import { FormMessage, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, TextField } from "./AuthUi";

export default function PasskeysPanel() {
  const { data: passkeys, isPending, error: listError, refetch } = authClient.useListPasskeys();
  const [name, setName] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reauthenticate, setReauthenticate] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setInfo(null);
    setReauthenticate(false);
    if (!window.isSecureContext || !window.PublicKeyCredential) {
      setError("Passkeys aren't supported in this browser. Try an up-to-date browser on a secure connection.");
      return;
    }
    setPending("add");
    try {
      const result = await authClient.passkey.addPasskey({ name: name.trim() || "My passkey" });
      if (result?.error) {
        if (needsReauthentication(result.error)) {
          setReauthenticate(true);
        } else {
          setError(authErrorMessage(result.error));
        }
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

  const needsSignIn = reauthenticate || needsReauthentication(listError);

  return (
    <>
      {passkeys?.map((passkey) => (
        <li key={passkey.id} className={styles.accountRow}>
          <span className={styles.rowIcon}><FontAwesomeIcon icon={faKey} aria-hidden="true" /></span>
          <span className={styles.rowBody}>
            <span className={styles.rowTitle}>{passkey.name || "Passkey"}</span>
            <span className={styles.rowDescription}>Passkey{passkey.createdAt ? ` · Added ${new Date(passkey.createdAt).toLocaleDateString()}` : ""}</span>
          </span>
          <button type="button" className={SECONDARY_BUTTON_CLASS} disabled={pending !== null}
            aria-label={`Remove ${passkey.name || "passkey"}`} onClick={() => void remove(passkey.id)}>
            {pending === passkey.id ? "Removing…" : "Remove"}
          </button>
        </li>
      ))}
      <li className={styles.accountRow}>
        <details id="add-passkey" className={styles.passkeySetup}
          ref={openReturningSetup}>
          <summary className={styles.passkeyAdd}>
            <FontAwesomeIcon icon={faPlus} aria-hidden="true" />
            Add a passkey
          </summary>
          <form onSubmit={add} className="mt-3 space-y-3">
            <p className="text-sm text-[color:var(--foreground-muted)]">Use your fingerprint, face, device PIN, or a security key. Keep another sign-in method for recovery.</p>
            <TextField label="Passkey name (optional)" name="passkey-name" placeholder="e.g. My phone" maxLength={80}
              value={name} onChange={(event) => setName(event.target.value)} disabled={pending !== null} />
            <FormMessage tone="error">{error}</FormMessage>
            {needsSignIn ? (
              <div className="space-y-3">
                <FormMessage tone="info">For your security, sign in again to add a passkey. We&apos;ll bring you back here to finish.</FormMessage>
                <Link className={PRIMARY_BUTTON_CLASS} href={reauthenticationHref("/account#add-passkey")}>
                  Sign in again to continue
                </Link>
              </div>
            ) : (
              <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={pending !== null} aria-busy={pending === "add"}>
                {pending === "add" ? "Follow your device's instructions…" : "Create passkey"}
              </button>
            )}
          </form>
        </details>
      </li>
      {isPending || listError || info ? (
        <li className={styles.accountRow}>
          <div className="w-full space-y-3">
            {isPending ? <p role="status" className={styles.rowDescription}>Loading passkeys…</p> : null}
            <FormMessage tone="info">{info}</FormMessage>
            {listError && !needsSignIn ? (
              <>
                <FormMessage tone="error">We couldn&apos;t load your passkeys.</FormMessage>
                <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={() => void refetch()}>Reload passkeys</button>
              </>
            ) : null}
            {listError && needsSignIn ? <Link className={SECONDARY_BUTTON_CLASS} href={reauthenticationHref("/account#add-passkey")}>Sign in again to load passkeys</Link> : null}
          </div>
        </li>
      ) : null}
    </>
  );
}

function openReturningSetup(element: HTMLDetailsElement | null) {
  if (element && window.location.hash === "#add-passkey") {
    element.open = true;
    element.scrollIntoView({ block: "center" });
  }
}
