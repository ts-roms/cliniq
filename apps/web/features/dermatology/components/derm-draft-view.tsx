'use client';

import type { DermDraft } from '../schemas/derm';

const LIKELIHOOD_TONE = {
  low: 'bg-zinc-200 text-zinc-700',
  moderate: 'bg-amber-100 text-amber-800',
  high: 'bg-rose-100 text-rose-800',
} as const;

export function DermDraftView({ draft }: { draft: DermDraft }) {
  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
      <Section title="Differentials">
        {draft.differentials.length === 0 ? (
          <p className="text-sm text-muted-foreground">None proposed.</p>
        ) : (
          <ul className="space-y-2">
            {draft.differentials.map((d, i) => (
              <li key={i} className="rounded border bg-card p-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{d.condition}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${LIKELIHOOD_TONE[d.likelihood]}`}
                  >
                    {d.likelihood}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{d.reasoning}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {draft.redFlags.length > 0 && (
        <Section title="Red flags" tone="rose">
          <ul className="list-inside list-disc space-y-0.5 text-sm">
            {draft.redFlags.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </Section>
      )}

      {draft.recommendedNextSteps.length > 0 && (
        <Section title="Suggested next steps">
          <ul className="list-inside list-disc space-y-0.5 text-sm">
            {draft.recommendedNextSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </Section>
      )}

      {draft.uncertainty.length > 0 && (
        <Section title="Uncertainty">
          <ul className="list-inside list-disc space-y-0.5 text-sm text-muted-foreground">
            {draft.uncertainty.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </Section>
      )}

      <p className="text-xs italic text-muted-foreground">
        {draft.disclaimer ??
          'Clinical decision support only — not a diagnostic device. Final judgment is the clinician’s.'}
      </p>
    </div>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: 'rose';
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4
        className={`mb-1 text-xs font-semibold uppercase tracking-wide ${
          tone === 'rose' ? 'text-rose-700' : 'text-muted-foreground'
        }`}
      >
        {title}
      </h4>
      {children}
    </div>
  );
}
