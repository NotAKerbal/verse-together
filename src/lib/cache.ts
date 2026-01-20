// A simple in-memory cache
const cache = new Map<string, any>();

export function getCache<T>(key: string): T | undefined {
  return cache.get(key);
}

export function setCache<T>(key: string, value: T) {
  cache.set(key, value);
}
