// An in-memory stand-in for expo-secure-store's synchronous API, for the account tests.
import type { SecureStorage } from "../src/account/client";

export function memorySecureStore(): SecureStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    deleteItemAsync: async (key) => {
      data.delete(key);
    },
  };
}
