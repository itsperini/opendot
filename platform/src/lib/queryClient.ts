import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 10_000,
    },
  },
});

export function platformStateQueryKey(userId: string | null | undefined) {
  return ["platform-state", userId ?? "anonymous"] as const;
}
