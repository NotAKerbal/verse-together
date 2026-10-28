// The versetogether://auth-callback route in the real router. This test build has no sign-in configuration, as a
// build without EXPO_PUBLIC_SITE_URL / EXPO_PUBLIC_CONVEX_URL: a return link (here a crafted one carrying a code and,
// as the old return format did, a session cookie) signs nothing in and leaves for Settings, which says sign-in isn't
// set up. The configured completion is tested in account.test.ts and accountProvider.test.tsx.

import { act, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { memoryStorage, setStoragePort } from "../src/storage/kv";
import { initDeviceStudy } from "../src/storage/study";

beforeEach(() => {
  setStoragePort(memoryStorage());
  initDeviceStudy();
});

it("a sign-in return that isn't this device's own does nothing and opens Settings", async () => {
  const cookie = encodeURIComponent("better-auth.session_token=attacker; Path=/");
  const code = "A".repeat(43);
  await renderRouter("./app", { initialUrl: `/auth-callback?attempt=forged&code=${code}&cookie=${cookie}` });
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
  await waitFor(() => expect(screen).toHavePathname("/settings"));
  expect(await screen.findByText(/Signing in isn’t set up in this build/)).toBeTruthy();
});
