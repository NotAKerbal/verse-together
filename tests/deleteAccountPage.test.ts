// /delete-account (src/features/auth/DeleteAccount.tsx) for each sign-in state. Rendered to static markup with the
// auth hook stubbed, so this checks what is offered when, not the deletion itself: the route it calls is tested
// against real Better Auth in tests/convex/nativeAuth.test.ts.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

type AuthState = {
  configured: boolean;
  loading: boolean;
  user: { id: string } | null;
  error: string | null;
  authUser: { email: string } | null;
  pendingDeletion: { appUserId: string; startedAt: number } | null;
  signingIn: boolean;
  promptSignIn: () => void;
};

let auth: AuthState;

vi.mock("@/lib/auth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/auth-client", () => ({ authClient: { deleteUser: vi.fn(), $store: { notify: vi.fn() } } }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) => createElement("a", { href, ...rest }, children as never),
}));

const { default: DeleteAccount } = await import("../src/features/auth/DeleteAccount");

const render = () => renderToStaticMarkup(createElement(DeleteAccount));

beforeEach(() => {
  auth = {
    configured: true,
    loading: false,
    user: null,
    error: null,
    authUser: null,
    pendingDeletion: null,
    signingIn: false,
    promptSignIn: () => {},
  };
});

describe("/delete-account", () => {
  test("signed out: says what is deleted and asks to sign in with Google, deleting nothing yet", () => {
    const html = render();
    expect(html).toContain("Delete your account");
    expect(html).toContain("Sign in with Google to continue");
    expect(html).toContain("journal entries, notes, marks");
    expect(html).not.toContain("Delete my account permanently");
  });

  test("signed in: deletion waits for the confirmation box", () => {
    auth = { ...auth, user: { id: "owner-A" }, authUser: { email: "ada@example.com" } };
    const html = render();
    expect(html).toContain("ada@example.com");
    expect(html).toContain('type="checkbox"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Delete my account permanently<\/button>/);
  });

  test("a deletion that stopped partway is offered to finish without a loaded app account", () => {
    auth = {
      ...auth,
      authUser: { email: "ada@example.com" },
      pendingDeletion: { appUserId: "owner-A", startedAt: 1 },
    };
    const html = render();
    expect(html).toContain("Finish deleting your account");
    expect(html).toContain("started but didn&#x27;t finish");
    expect(html).toContain("Finish deleting my account");
  });

  test("an account that couldn't be loaded can still be deleted with its own session", () => {
    auth = { ...auth, authUser: { email: "ada@example.com" }, error: "We couldn't load your account. Try again." };
    expect(render()).toContain("Delete my account permanently");
  });

  test("a copy of the site without accounts says so", () => {
    auth = { ...auth, configured: false };
    expect(render()).toContain("Accounts aren&#x27;t available");
  });
});
