import { Card, CardContent } from '@org/ui';

export function PatientsEmpty({ q }: { q: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-sm text-muted-foreground">
        {q ? `No patients match "${q}"` : 'No patients yet. Add the first one.'}
      </CardContent>
    </Card>
  );
}
