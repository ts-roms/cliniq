export function ScheduleEmpty({ dateLabel }: { dateLabel: string }) {
  return (
    <div className="rounded-lg border border-dashed py-12 text-center">
      <p className="text-sm text-muted-foreground">
        No appointments scheduled for {dateLabel}.
      </p>
    </div>
  );
}
