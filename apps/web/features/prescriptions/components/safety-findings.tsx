import type { InteractionFinding } from '../schemas/prescription';

const TONE: Record<InteractionFinding['severity'], string> = {
  low: 'border-muted-foreground/30 text-muted-foreground',
  medium: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-900 dark:text-yellow-200',
  high: 'border-orange-500/40 bg-orange-500/10 text-orange-900 dark:text-orange-200',
  urgent: 'border-destructive bg-destructive/10 text-destructive',
};

const ICON: Record<InteractionFinding['severity'], string> = {
  low: '·',
  medium: '!',
  high: '!!',
  urgent: '⛔',
};

export function SafetyFindings({ findings }: { findings: InteractionFinding[] }) {
  if (findings.length === 0) {
    return (
      <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
        No interactions or allergy conflicts detected.
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {findings.map((f, i) => (
        <li key={i} className={`rounded-md border px-3 py-2 text-xs ${TONE[f.severity]}`}>
          <span className="font-mono">{ICON[f.severity]}</span>{' '}
          <span className="font-medium uppercase">{f.severity}</span>{' '}
          <span>{f.message}</span>
          <span className="ml-1 font-mono text-[10px] opacity-75">
            ({f.drugs.join(' + ')})
          </span>
        </li>
      ))}
    </ul>
  );
}
