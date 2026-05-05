import { PortalLoginForm } from '@/features/portal';

export default function PortalLoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10 sm:px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.08),transparent_60%)]"
      />
      <PortalLoginForm />
    </main>
  );
}
