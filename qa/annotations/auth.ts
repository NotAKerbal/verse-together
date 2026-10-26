// Only this isolated Vite harness aliases @/lib/auth: a synthetic signed-in reader, no auth requests.
export function useAuth() {
  return { user: { id: "synthetic-reader", fullName: "Synthetic reader" }, loading: false, promptSignIn: async () => {} };
}
