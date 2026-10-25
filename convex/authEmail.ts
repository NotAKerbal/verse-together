// Transactional auth email (password reset, address verification) through Resend's HTTP API.
// Only used when RESEND_API_KEY and AUTH_EMAIL_FROM are set on the Convex deployment; see
// docs/auth-migration.md. Runs inside the Better Auth HTTP action, so plain fetch is available.

type AuthEmail = {
  to: string;
  subject: string;
  intro: string;
  actionLabel: string;
  url: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendAuthEmail(config: { resendApiKey: string; from: string }, email: AuthEmail): Promise<void> {
  const text = `${email.intro}\n\n${email.actionLabel}: ${email.url}\n\nIf you did not request this, you can ignore this email.`;
  const html = `<p>${escapeHtml(email.intro)}</p><p><a href="${escapeHtml(email.url)}">${escapeHtml(
    email.actionLabel
  )}</a></p><p>If you did not request this, you can ignore this email.</p>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: config.from, to: [email.to], subject: email.subject, text, html }),
  });
  if (!response.ok) {
    // Never log the recipient or the tokenized URL.
    console.error("Auth email delivery failed", response.status);
    throw new Error("Email delivery failed");
  }
}
