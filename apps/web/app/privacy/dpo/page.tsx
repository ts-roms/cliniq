// Data Protection Officer contact page. Required public disclosure under
// NPC Circular 16-01 §3.A. This intentionally lives at a stable, easily
// quoted URL — never hide a DPO behind a contact form.

const DPO_NAME = process.env.NEXT_PUBLIC_DPO_NAME ?? 'Data Protection Officer';
const DPO_EMAIL = process.env.NEXT_PUBLIC_DPO_EMAIL ?? 'dpo@cliniq.health';
const DPO_PHONE = process.env.NEXT_PUBLIC_DPO_PHONE ?? null;
const DPO_ADDRESS = process.env.NEXT_PUBLIC_DPO_ADDRESS ?? null;

export const metadata = {
  title: 'Data Protection Officer · ClinIQ',
  description:
    "Contact information for ClinIQ's Data Protection Officer under the Philippine Data Privacy Act.",
};

export default function DpoPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        Filed with the National Privacy Commission · RA 10173 §21
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Data Protection Officer
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Per the Data Privacy Act of 2012, ClinIQ has designated a Data
        Protection Officer to address questions, concerns, and requests
        about personal data we process on behalf of clinic clients.
      </p>

      <dl className="mt-8 space-y-3 rounded-lg border bg-card p-5 text-sm">
        <Row label="Name" value={DPO_NAME} />
        <Row label="Email" value={<a className="text-primary underline" href={`mailto:${DPO_EMAIL}`}>{DPO_EMAIL}</a>} />
        {DPO_PHONE && <Row label="Phone" value={DPO_PHONE} />}
        {DPO_ADDRESS && <Row label="Postal address" value={DPO_ADDRESS} />}
      </dl>

      <section className="mt-8 space-y-3 text-sm">
        <h2 className="text-lg font-semibold tracking-tight">
          Your rights under the DPA
        </h2>
        <p className="text-muted-foreground">
          You may request the following from your clinic (the controller of
          your record); ClinIQ will support the clinic in fulfilling them
          within the statutory timelines.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Right to be informed of how your data is processed</li>
          <li>Right to access your records</li>
          <li>Right to correct inaccurate or outdated information</li>
          <li>Right to erasure or blocking (subject to clinical retention)</li>
          <li>Right to data portability</li>
          <li>Right to object to processing</li>
          <li>Right to lodge a complaint with the National Privacy Commission</li>
        </ul>
      </section>

      <section className="mt-8 space-y-3 text-sm">
        <h2 className="text-lg font-semibold tracking-tight">
          National Privacy Commission
        </h2>
        <p className="text-muted-foreground">
          You may also contact the NPC directly:
        </p>
        <p>
          <a className="text-primary underline" href="https://www.privacy.gov.ph/" target="_blank" rel="noreferrer">
            www.privacy.gov.ph
          </a>
          <br />
          5th Floor, Philippine International Convention Center, CCP Complex,
          Pasay City
          <br />
          info@privacy.gov.ph
        </p>
      </section>
    </main>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-baseline gap-3">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
