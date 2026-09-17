import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@org/ui';
import { ForgotPasswordForm } from '@/features/auth';

export default function ForgotPasswordPage() {
  return (
    <main className="container mx-auto flex min-h-screen items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-extralight">
            Forgot your password?
          </CardTitle>
          <CardDescription>
            Enter your email and we&apos;ll send a link to set a new one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm />
        </CardContent>
      </Card>
    </main>
  );
}
