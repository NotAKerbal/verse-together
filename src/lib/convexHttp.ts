import { ConvexHttpClient } from "convex/browser";

function getConvexUrl(): string {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_CONVEX_URL");
  }
  return url;
}

function createClient(token?: string) {
  const client = new ConvexHttpClient(getConvexUrl());
  if (token) {
    client.setAuth(token);
  }
  return client;
}

export async function convexQuery<T>(name: string, args: Record<string, unknown>, token?: string): Promise<T> {
  const client = createClient(token);
  return (await client.query(name as any, args)) as T;
}

export async function convexMutation<T>(name: string, args: Record<string, unknown>, token?: string): Promise<T> {
  const client = createClient(token);
  return (await client.mutation(name as any, args)) as T;
}
