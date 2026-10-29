import type { SharedRequests } from "@/lib/sharedRequests";
import { useSharedResource as useResource, type ResourceStateWithMessage } from "@/lib/useSharedResource";
import { errorMessage } from "./network";

export type ResourceState<T> = ResourceStateWithMessage<T>;

export function useSharedResource<T>(requests: SharedRequests<T>, key: string | null): [ResourceState<T>, () => void] {
  return useResource(requests, key, errorMessage);
}
