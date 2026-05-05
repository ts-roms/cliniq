import Link from 'next/link';

// Public privacy hub. Lists the docs every NPC-registered controller needs
// to publish: privacy notice, DPO contact, PIA summary, breach disclosure.

export default function PrivacyHub() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        Compliance · Republic Act 10173 (Data Privacy Act)
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Privacy & data protection
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        ClinIQ acts as a Personal Information Processor for clinics
        (Personal Information Controllers). This page lists the disclosures
        we publish under the DPA and its Implementing Rules and Regulations.
      </p>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <PrivacyTile
          href="/privacy/dpo"
          title="Data Protection Officer"
          summary="Who to contact about your personal data."
        />
        <PrivacyTile
          href="/privacy/pia"
          title="Privacy Impact Assessment"
          summary="What data we process, why, and how it's safeguarded."
        />
      </section>
    </main>
  );
}

function PrivacyTile({
  href,
  title,
  summary,
}: {
  href: string;
  title: string;
  summary: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border bg-card p-4 transition hover:border-primary"
    >
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
    </Link>
  );
}
