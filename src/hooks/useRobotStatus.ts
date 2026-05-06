import { useQuery } from "@tanstack/react-query";
import { robotClient, type RobotStatus } from "@/lib/robotClient";
import { isAuthenticated } from "@/lib/auth";

/**
 * Polls /robot/status every 2 seconds while the user is authenticated.
 * Disable polling by passing { enabled: false }.
 */
export function useRobotStatus(opts: { enabled?: boolean } = {}) {
  return useQuery<RobotStatus, Error>({
    queryKey: ["robot", "status"],
    queryFn: () => robotClient.status(),
    refetchInterval: 2000,
    enabled: (opts.enabled ?? true) && isAuthenticated(),
    retry: false,
    // Don't blow up the UI on transient network/auth failures; just leave
    // the previous status value visible.
    staleTime: 1000,
  });
}
