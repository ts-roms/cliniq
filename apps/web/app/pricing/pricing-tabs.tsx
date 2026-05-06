'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, X } from 'lucide-react';
import { Button } from '@org/ui';
import {
  ALL_LAB_PLANS,
  ALL_PLANS,
  Features,
  LAB_PLAN_META,
  PLAN_META,
  formatLabPlanPrice,
  formatPlanPrice,
  type Feature,
  type LabPlan,
  type Plan,
} from '@org/shared-types';

type Audience = 'clinic' | 'lab';

interface FeatureRow {
  id: Feature;
  label: string;
  comparisonOnly?: boolean;
}

const CLINIC_FEATURES: FeatureRow[] = [
  { id: Features.CORE_EMR, label: 'Core EMR (patients, consults, Rx, billing)' },
  { id: Features.REPORTS_BASIC, label: 'Basic reports', comparisonOnly: true },
  { id: Features.REPORTS_ADVANCED, label: 'Advanced reports & analytics' },
  { id: Features.INVENTORY, label: 'Inventory management' },
  { id: Features.LABS, label: 'Lab orders & results' },
  { id: Features.HMO, label: 'HMO claims tracking' },
  { id: Features.TELEMEDICINE, label: 'Telemedicine' },
  { id: Features.AI_SOAP, label: 'AI SOAP draft generation' },
  { id: Features.AI_DERMATOLOGY, label: 'AI dermatology assist' },
  { id: Features.WEBHOOKS, label: 'Webhooks for integrations' },
  { id: Features.CALENDAR_SYNC, label: 'External calendar sync' },
  { id: Features.CUSTOM_RETENTION, label: 'Custom data retention policy' },
];

const LAB_FEATURES: FeatureRow[] = [
  { id: Features.LAB_CATALOG, label: 'Custom product catalog' },
  { id: Features.LAB_DYNAMIC_FORMS, label: 'Multi-language dynamic forms' },
  { id: Features.LAB_ORDERS, label: 'Digital case requests' },
  { id: Features.LAB_FILE_UPLOADS, label: 'STL / ZIP / PDF / image uploads' },
  { id: Features.LAB_CALENDAR, label: 'Standard / urgent calendar' },
  { id: Features.LAB_PUBLIC_REQUEST, label: 'Public anonymous request link' },
  { id: Features.LAB_LOYALTY, label: 'Tiered loyalty discounts' },
  { id: Features.LAB_PHASES, label: 'Manufacturing phase tracking' },
  { id: Features.LAB_CHAT, label: 'Per-case chat' },
  { id: Features.LAB_INTERNAL_NOTES, label: 'Internal notes' },
  { id: Features.LAB_TAGS, label: 'Order tags & filters' },
  { id: Features.LAB_MULTILAB, label: 'Multi-lab assignment' },
  { id: Features.LAB_CONFORMITY_DOCS, label: 'Conformity documents' },
  { id: Features.LAB_CONSENT_ESIGN, label: 'Consent file with e-signature' },
  { id: Features.LAB_MATERIALS_LOT, label: 'Material / LOT traceability' },
  { id: Features.LAB_SHIPMENTS, label: 'Shipments with tracking number' },
  { id: Features.LAB_PAYMENT_LINKS, label: 'Payment links on invoices' },
  { id: Features.LAB_STATS_PANEL, label: 'Statistics panel' },
  { id: Features.LAB_EINVOICE, label: 'E-invoice integration' },
  { id: Features.LAB_TREATMENT_PLAN, label: 'Treatment plan manager' },
  { id: Features.LAB_3D_VIEWER, label: '3D viewer (OnyxCeph / 3Shape)' },
  { id: Features.LAB_AI_ASSIST, label: 'Generative AI assist (GPT-4)' },
  { id: Features.LAB_MACHINE_CONTROL, label: 'Machine control & scheduling' },
  { id: Features.LAB_DISPUTE_MANAGER, label: 'Dispute manager' },
  { id: Features.LAB_CUSTOM_DOMAIN, label: 'Custom domain (on-demand)' },
  { id: Features.LAB_DEDICATED_SERVER, label: 'Dedicated server (on-demand)' },
];

export function PricingTabs() {
  const [audience, setAudience] = useState<Audience>('clinic');
  return (
    <>
      <div className="flex justify-center">
        <div className="inline-flex rounded-full border border-border/60 bg-background p-1">
          <TabButton active={audience === 'clinic'} onClick={() => setAudience('clinic')}>
            For Clinics
          </TabButton>
          <TabButton active={audience === 'lab'} onClick={() => setAudience('lab')}>
            For Labs
          </TabButton>
        </div>
      </div>

      <section className="container mx-auto px-4 pt-10 pb-16 sm:px-6 sm:pb-20">
        {audience === 'clinic' ? (
          <ClinicCards />
        ) : (
          <LabCards />
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Prices in PHP, exclusive of VAT. Annual billing available — contact us for a 20% discount.
        </p>
      </section>

      <section className="border-t border-border/50 bg-muted/20">
        <div className="container mx-auto px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extralight tracking-tight sm:text-4xl">
              Compare every feature
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              {audience === 'clinic'
                ? 'All clinic plans include audit logs, MFA, role-based access, and PRC-compliant prescriptions.'
                : 'All lab plans include audit logs, MFA, role-based access, and free clinic accounts for your associated clinics.'}
            </p>
          </div>

          <div className="mx-auto mt-10 max-w-4xl overflow-x-auto rounded-xl border border-border/60 bg-background">
            {audience === 'clinic' ? <ClinicCompareTable /> : <LabCompareTable />}
          </div>
        </div>
      </section>
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full px-5 py-1.5 text-sm font-medium transition ' +
        (active
          ? 'bg-primary text-primary-foreground shadow'
          : 'text-muted-foreground hover:text-foreground')
      }
    >
      {children}
    </button>
  );
}

// ── Clinic side ─────────────────────────────────────────────

function ClinicCards() {
  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-3">
      {ALL_PLANS.map((id) => (
        <ClinicCard key={id} plan={id} />
      ))}
    </div>
  );
}

function ClinicCard({ plan }: { plan: Plan }) {
  const meta = PLAN_META[plan];
  const cardFeatures = CLINIC_FEATURES.filter((r) => !r.comparisonOnly);
  return (
    <PlanShell highlight={!!meta.highlight}>
      <PlanHeader label={meta.label} tagline={meta.tagline} />
      <PlanPrice price={formatPlanPrice(meta)} hasPeriod={meta.priceMonthly !== null} />
      <p className="mt-1 text-xs text-muted-foreground">
        {Number.isFinite(meta.maxLocations)
          ? `Up to ${meta.maxLocations} location${meta.maxLocations === 1 ? '' : 's'}`
          : 'Unlimited locations'}
      </p>
      <FeatureList rows={cardFeatures} active={new Set(meta.features)} />
      <Button
        asChild
        variant={meta.highlight ? 'default' : 'outline'}
        className="mt-8 w-full"
      >
        <Link href={`/signup?kind=clinic&plan=${meta.id}`}>{meta.cta ?? 'Start free trial'}</Link>
      </Button>
    </PlanShell>
  );
}

function ClinicCompareTable() {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          <th className="px-5 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground">
            Feature
          </th>
          {ALL_PLANS.map((id) => (
            <th
              key={id}
              className="px-5 py-3 text-center text-xs uppercase tracking-wider text-muted-foreground"
            >
              {PLAN_META[id].label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {CLINIC_FEATURES.map((row) => (
          <tr key={row.id} className="border-b last:border-0">
            <td className="px-5 py-3">{row.label}</td>
            {ALL_PLANS.map((id) => {
              const has = PLAN_META[id].features.includes(row.id);
              return (
                <td key={id} className="px-5 py-3 text-center">
                  {has ? <YesIcon /> : <NoIcon />}
                </td>
              );
            })}
          </tr>
        ))}
        <tr className="border-b last:border-0 bg-muted/30">
          <td className="px-5 py-3 font-medium">Locations included</td>
          {ALL_PLANS.map((id) => (
            <td key={id} className="px-5 py-3 text-center font-medium">
              {Number.isFinite(PLAN_META[id].maxLocations)
                ? PLAN_META[id].maxLocations
                : 'Unlimited'}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

// ── Lab side ────────────────────────────────────────────────

function LabCards() {
  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-3">
      {ALL_LAB_PLANS.map((id) => (
        <LabCard key={id} plan={id} />
      ))}
    </div>
  );
}

function LabCard({ plan }: { plan: LabPlan }) {
  const meta = LAB_PLAN_META[plan];
  // For the marketing card, show a curated subset (the top differentiators).
  const cardFeatures = LAB_FEATURES.slice(0, 9);
  return (
    <PlanShell highlight={!!meta.highlight}>
      <PlanHeader label={meta.label} tagline={meta.tagline} />
      <PlanPrice price={formatLabPlanPrice(meta)} hasPeriod={meta.priceMonthly !== null} />
      <p className="mt-1 text-xs text-muted-foreground">
        {meta.limits.ordersPerMonth === null
          ? 'Unlimited cases / month'
          : `${meta.limits.ordersPerMonth.toLocaleString()} cases / month`}
        {' · '}
        {meta.limits.cloudStorageGb === null
          ? 'Unlimited cloud'
          : `${meta.limits.cloudStorageGb} GB cloud`}
      </p>
      <FeatureList rows={cardFeatures} active={new Set(meta.features)} />
      <Button
        asChild
        variant={meta.highlight ? 'default' : 'outline'}
        className="mt-8 w-full"
      >
        <Link href={`/signup?kind=lab&plan=${meta.id}`}>{meta.cta ?? 'Try it for free'}</Link>
      </Button>
    </PlanShell>
  );
}

function LabCompareTable() {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          <th className="px-5 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground">
            Feature
          </th>
          {ALL_LAB_PLANS.map((id) => (
            <th
              key={id}
              className="px-5 py-3 text-center text-xs uppercase tracking-wider text-muted-foreground"
            >
              {LAB_PLAN_META[id].label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {LAB_FEATURES.map((row) => (
          <tr key={row.id} className="border-b last:border-0">
            <td className="px-5 py-3">{row.label}</td>
            {ALL_LAB_PLANS.map((id) => {
              const has = LAB_PLAN_META[id].features.includes(row.id);
              return (
                <td key={id} className="px-5 py-3 text-center">
                  {has ? <YesIcon /> : <NoIcon />}
                </td>
              );
            })}
          </tr>
        ))}
        <tr className="border-b last:border-0 bg-muted/30">
          <td className="px-5 py-3 font-medium">Cases per month</td>
          {ALL_LAB_PLANS.map((id) => (
            <td key={id} className="px-5 py-3 text-center font-medium">
              {LAB_PLAN_META[id].limits.ordersPerMonth === null
                ? 'Unlimited'
                : LAB_PLAN_META[id].limits.ordersPerMonth!.toLocaleString()}
            </td>
          ))}
        </tr>
        <tr className="border-b last:border-0 bg-muted/30">
          <td className="px-5 py-3 font-medium">Users / employees</td>
          {ALL_LAB_PLANS.map((id) => (
            <td key={id} className="px-5 py-3 text-center font-medium">
              {LAB_PLAN_META[id].limits.usersPerLab === null
                ? 'Unlimited'
                : LAB_PLAN_META[id].limits.usersPerLab!.toLocaleString()}
            </td>
          ))}
        </tr>
        <tr className="border-b last:border-0 bg-muted/30">
          <td className="px-5 py-3 font-medium">Cloud storage</td>
          {ALL_LAB_PLANS.map((id) => (
            <td key={id} className="px-5 py-3 text-center font-medium">
              {LAB_PLAN_META[id].limits.cloudStorageGb === null
                ? 'Unlimited'
                : `${LAB_PLAN_META[id].limits.cloudStorageGb} GB`}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

// ── Shared bits ─────────────────────────────────────────────

function PlanShell({
  highlight,
  children,
}: {
  highlight: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        'relative flex flex-col rounded-2xl border bg-background p-6 shadow-sm transition ' +
        (highlight
          ? 'border-primary/60 shadow-lg ring-1 ring-primary/20'
          : 'border-border/60 hover:border-border')
      }
    >
      {highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow">
          Best value
        </span>
      )}
      {children}
    </div>
  );
}

function PlanHeader({ label, tagline }: { label: string; tagline: string }) {
  return (
    <div>
      <h3 className="text-lg font-semibold">{label}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{tagline}</p>
    </div>
  );
}

function PlanPrice({ price, hasPeriod }: { price: string; hasPeriod: boolean }) {
  return (
    <div className="mt-6 flex items-baseline gap-1.5">
      <span className="text-4xl font-light tracking-tight">{price}</span>
      {hasPeriod && <span className="text-sm text-muted-foreground">/ month</span>}
    </div>
  );
}

function FeatureList({
  rows,
  active,
}: {
  rows: FeatureRow[];
  active: ReadonlySet<Feature>;
}) {
  return (
    <ul className="mt-6 flex-1 space-y-2.5 text-sm">
      {rows.map((row) => {
        const has = active.has(row.id);
        return (
          <li
            key={row.id}
            className={'flex items-start gap-2 ' + (has ? '' : 'text-muted-foreground/50')}
          >
            {has ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
            ) : (
              <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/30" aria-hidden />
            )}
            <span>{row.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

function YesIcon() {
  return <Check className="mx-auto h-4 w-4 text-emerald-500" aria-label="included" />;
}

function NoIcon() {
  return <X className="mx-auto h-4 w-4 text-muted-foreground/30" aria-label="not included" />;
}
