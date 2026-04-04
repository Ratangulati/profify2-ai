import { WorkspaceLayout } from "@/components/workspace/WorkspaceLayout";
import { env } from "@/env";

interface PageProps {
  params: {
    workspaceId: string;
    projectId: string;
  };
}

export default function WorkspacePage({ params }: PageProps) {
  return (
    <WorkspaceLayout
      workspaceId={params.workspaceId}
      projectId={params.projectId}
      apiBaseUrl={env.NEXT_PUBLIC_API_URL}
    />
  );
}
