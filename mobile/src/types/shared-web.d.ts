// The web's HelloAO client (src/lib/helloaoApi.ts) passes Next.js's `next` caching hint to fetch. React Native's
// fetch ignores unknown options; this declares it so the shared module typechecks here as it does in Next.
export {};

declare global {
  interface RequestInit {
    next?: { revalidate?: number | false; tags?: string[] };
  }
}
