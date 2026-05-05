// Privacy Impact Assessment summary. The detailed working PIA lives in
// docs/regulatory/pia.md (internal); this is the public-facing summary
// required under NPC Circular 16-04 for processing of sensitive personal
// information at scale.

export const metadata = {
  title: 'Privacy Impact Assessment · ClinIQ',
  description:
    'Summary of how ClinIQ collects, processes, and safeguards personal health information.',
};

export default function PiaPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        NPC Circular 16-04 · Last reviewed 2026-Q2
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Privacy Impact Assessment — summary
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        This summarizes the assessment of risks ClinIQ's processing poses to
        the rights and freedoms of data subjects, and the controls in place
        to mitigate them.
      </p>

      <Section title="1. What we process">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Patient records</strong> — name, MRN, sex, date of birth,
            contact details, allergies, medications, conditions, vitals,
            consultations, diagnostic codes, prescriptions, lab orders.
          </li>
          <li>
            <strong>Clinic accounts</strong> — name, email, role, PRC license
            number for clinical staff.
          </li>
          <li>
            <strong>Audit metadata</strong> — who-did-what timestamps, IP
            address, user agent for every state-changing request.
          </li>
          <li>
            <strong>AI processing</strong> — opt-in: consultation transcripts
            and SOAP draft generations for clinical decision support.
          </li>
        </ul>
      </Section>

      <Section title="2. Lawful basis">
        Processing occurs under three bases (DPA §12, §13):
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>Necessary for medical treatment</strong> (§13.f) for the
            core clinical record.
          </li>
          <li>
            <strong>Explicit, granular consent</strong> for portal account
            creation, AI processing, and marketing communications.
          </li>
          <li>
            <strong>Legal obligation</strong> for tax records and
            mandatory clinical retention.
          </li>
        </ul>
      </Section>

      <Section title="3. Recipients">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            The clinic operating the system (Personal Information
            Controller).
          </li>
          <li>
            <strong>AWS</strong> (data hosting, encryption, backups —
            ap-southeast-1 / Singapore).
          </li>
          <li>
            <strong>Anthropic via AWS Bedrock</strong> (clinical AI drafting,
            opt-in only). No data leaves AWS managed boundaries.
          </li>
          <li>
            Payment service providers (PayMongo / Xendit) — only invoice
            metadata and payment confirmations.
          </li>
          <li>SMS providers (Semaphore / Twilio) — phone numbers only.</li>
        </ul>
        <p className="mt-2">
          We do not sell, license, or disclose patient data for advertising
          or research without separate explicit consent.
        </p>
      </Section>

      <Section title="4. Retention">
        <ul className="list-disc space-y-1 pl-5">
          <li>Active patient records — for the duration of the clinic-patient relationship.</li>
          <li>Inactive / closed records — 10 years from last visit (DOH AO 2008-0029).</li>
          <li>Audit logs — 7 years from event.</li>
          <li>Audio transcripts — 30 days from consultation, then deleted.</li>
          <li>Backups — 35 days, encrypted at rest, then rotated.</li>
        </ul>
        <p className="mt-2">
          Erasure requests against records still under clinical-retention law
          are honored by anonymization rather than deletion.
        </p>
      </Section>

      <Section title="5. Safeguards">
        <ul className="list-disc space-y-1 pl-5">
          <li>TLS 1.2+ in transit; AES-256 at rest (RDS + S3 KMS).</li>
          <li>
            Multi-tenant isolation enforced in three layers: application
            (tenant context middleware), database (PostgreSQL Row-Level
            Security policies), and CI tests that verify no cross-tenant
            read is possible.
          </li>
          <li>RBAC at the controller level + audit log on every write.</li>
          <li>MFA (TOTP) required for clinical roles.</li>
          <li>
            Granular, revocable consents for AI processing, marketing, and
            anonymized research.
          </li>
          <li>Daily encrypted backups; quarterly restore drills.</li>
          <li>Annual third-party penetration test.</li>
        </ul>
      </Section>

      <Section title="6. Data subject rights">
        <p>
          Patients exercise rights of access, correction, erasure, objection,
          and portability through their clinic. The clinic submits the
          request via ClinIQ&apos;s Data Subject Request module; we fulfill
          within 15 calendar days (DPA §16).
        </p>
      </Section>

      <Section title="7. Breach response">
        <p>
          If we determine a personal data breach has occurred, we notify the
          affected clinic within 24 hours and the National Privacy
          Commission within 72 hours, per the DPA IRR §38.
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 text-sm leading-relaxed">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 text-muted-foreground">{children}</div>
    </section>
  );
}
