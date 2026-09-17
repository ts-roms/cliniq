import { Suspense } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@org/ui';
import { ResetPasswordForm } from '@/features/auth';

export default function ResetPasswordPage() {
  return (
    <main className="container mx-auto flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-extralight">Set a new password</CardTitle>
          <CardDescription>
            This link works once and expires 30 minutes after it was sent.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* useSearchParams forces a client render; Suspense keeps the shell static. */}
          <Suspense
            fallback={
              <div className="h-24 rounded-md bg-muted/40" aria-hidden />
            }
          >
            <ResetPasswordForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
