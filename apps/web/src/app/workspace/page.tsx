import { WorkspaceLayout } from "@/components/workspace/WorkspaceLayout";

export default function WorkspacePage() {
  return (
    <WorkspaceLayout
      workspaceId="demo"
      projectId="demo"
      apiBaseUrl={process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}
    />
  );
}
