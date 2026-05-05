import Link from 'next/link';
import {
  Card, CardContent, CardHeader, CardTitle,
  Loading,
  EmptyState,
} from '@org/ui';
import type { Consultation } from '../schemas/consultation';

export function ConsultationsCard({
  items,
  isLoading,
}: {
  items: Consultation[] | undefined;
  isLoading: boolean;
}) {
  return (
    <Card className="md:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Consultations</CardTitle>
        <span className="text-xs text-muted-foreground">
          {items?.length ?? 0} recorded
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <Loading />}
        {items?.length === 0 && (
          <EmptyState
            title="No consultations yet"
            description="Start a new consultation from the patient header."
          />
        )}
        {items?.map((c) => <ConsultationRow key={c.id} consult={c} />)}
      </CardContent>
    </Card>
  );
}

function ConsultationRow({ consult: c }: { consult: Consultation }) {
  return (
    <div className="flex items-center justify-between rounded border px-3 py-2 text-sm">
      <div>
        <span className="font-medium">{c.status}</span>
        <span className="ml-2 text-muted-foreground">
          {new Date(c.startedAt).toLocaleString()}
        </span>
      </div>
      <Link href={`/consultations/${c.id}`} className="text-xs text-primary hover:underline">
        Open →
      </Link>
    </div>
  );
}
