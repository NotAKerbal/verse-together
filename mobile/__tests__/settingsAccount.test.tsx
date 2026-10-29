// Settings → Account in the real router with the account itself stood in for (its sign-in, session and deletion are
// tested through the real AccountProvider in accountProvider.test.tsx): whatever state the account is in, its
// actions are on the screen Settings opens to and reach the account.

import { act, fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { Alert } from "react-native";
import { memoryStorage, setStoragePort } from "../src/storage/kv";
import { initDeviceStudy } from "../src/storage/study";

const mockAccount = {
  status: "signed-in" as string,
  user: { appUserId: "user-1", email: "reader@example.com", name: "Reader" } as { appUserId: string; email: string | null; name: string | null } | null,
  sessionEmail: "reader@example.com" as string | null,
  notice: null,
  signingIn: false,
  signIn: jest.fn(async () => null),
  signOut: jest.fn(async () => {}),
  deleteAccount: jest.fn(async () => ({ ok: true as const })),
  copyStudy: jest.fn(async () => ({ copied: 0, error: null })),
  completeReturn: jest.fn(() => null),
  clearNotice: jest.fn(),
  retry: jest.fn(),
};

jest.mock("../src/account/AccountProvider", () => ({
  AccountProvider: ({ children }: { children: unknown }) => children,
  useAccount: () => mockAccount,
}));

async function press(element: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(element);
  });
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
}

beforeEach(() => {
  setStoragePort(memoryStorage());
  initDeviceStudy();
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
    buttons?.find((button) => button.style === "destructive")?.onPress?.();
  });
});

afterEach(() => jest.restoreAllMocks());

it("signed in: Sign out and Delete my account are in the section Settings opens to, and reach the account", async () => {
  Object.assign(mockAccount, { status: "signed-in", user: { appUserId: "user-1", email: "reader@example.com", name: "Reader" } });
  await renderRouter("./app", { initialUrl: "/settings" });
  expect(await screen.findByText("Reader")).toBeTruthy();
  expect(screen.getByText("reader@example.com")).toBeTruthy();

  await press(screen.getByLabelText("Delete my account"));
  expect(mockAccount.deleteAccount).toHaveBeenCalledTimes(1);
  await press(screen.getByLabelText("Sign out"));
  expect(mockAccount.signOut).toHaveBeenCalledTimes(1);
});

it("a deletion that stopped partway can be finished from Settings, even after visiting another section", async () => {
  Object.assign(mockAccount, { status: "deletion-pending", user: null });
  await renderRouter("./app", { initialUrl: "/settings?tab=about" });
  await screen.findByTestId("settings-tab-account");
  await press(screen.getByLabelText("Go to Account"));
  await press(screen.getByLabelText("Finish deleting my account"));
  expect(mockAccount.deleteAccount).toHaveBeenCalledTimes(1);
});

it("signed out: Continue with Google starts sign-in", async () => {
  Object.assign(mockAccount, { status: "signed-out", user: null, sessionEmail: null });
  await renderRouter("./app", { initialUrl: "/settings" });
  await press(await screen.findByLabelText("Continue with Google"));
  expect(mockAccount.signIn).toHaveBeenCalledTimes(1);
});
