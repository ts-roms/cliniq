'use client';

import { NotificationsList } from '@/features/notifications';

export default function NotificationsPage() {
  return (
    <div className="container mx-auto space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          In-app feed · poll every minute, click to mark read
        </p>
      </header>
      <NotificationsList />
    </div>
  );
}
