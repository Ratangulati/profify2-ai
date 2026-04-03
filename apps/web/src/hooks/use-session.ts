"use client";

import { useSession as useNextAuthSession } from "next-auth/react";
import type { WorkspaceRole } from "@pm-yc/auth";

interface WorkspaceContext {
  workspaceId: string;
  role: WorkspaceRole;
}

interface UseSessionReturn {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
  workspaces: WorkspaceContext[];
  isLoading: boolean;
  isAuthenticated: boolean;
  getRoleInWorkspace: (workspaceId: string) => WorkspaceRole | null;
}

export function useSession(): UseSessionReturn {
  const { data: session, status } = useNextAuthSession();

  const user = session?.user
    ? {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      }
    : null;

  // Access workspaces from our extended session type
  const workspaces = (session as { workspaces?: WorkspaceContext[] } | null)?.workspaces ?? [];

  const getRoleInWorkspace = (workspaceId: string): WorkspaceRole | null => {
    const membership = workspaces.find((w) => w.workspaceId === workspaceId);
    return membership?.role ?? null;
  };

  return {
    user,
    workspaces,
    isLoading: status === "loading",
    isAuthenticated: status === "authenticated",
    getRoleInWorkspace,
  };
}
