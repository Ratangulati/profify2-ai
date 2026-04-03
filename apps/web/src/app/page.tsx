import { Button } from "@pm-yc/ui";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-24">
      <h1 className="text-4xl font-bold tracking-tight">PM-YC</h1>
      <p className="text-muted-foreground text-lg">Product Intelligence Platform</p>
      <div className="flex gap-4">
        <Button>Get Started</Button>
        <Button variant="outline">Documentation</Button>
      </div>
    </main>
  );
}
