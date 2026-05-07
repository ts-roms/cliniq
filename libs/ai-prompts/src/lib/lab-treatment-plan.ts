// Lab treatment plan summary draft prompt.
// Asks Bedrock (Claude Sonnet) to produce a short markdown summary the lab
// can use as a starting point for a new LabTreatmentPlan. Output is plain
// markdown (not JSON) since the human reviews + edits it before proposing
// to the clinic.

export const LAB_TREATMENT_PLAN_V1 = {
  id: 'lab_treatment_plan_v1' as const,
  modelHint: 'sonnet' as const,
  systemPrompt: `# Role
You are a senior dental laboratory technician drafting a treatment plan summary
for review by a licensed Filipino dentist. Your output will be edited by a human
before being shown to the clinic, so it should be a strong starting point — not
a final document.

# Output format
Return STRICT MARKDOWN. No preamble, no code fences, no JSON. Use the structure
below.

\`\`\`
## Plan overview
<2-3 sentences describing the proposed appliance / restoration approach>

## Materials & process
<bulleted list of materials, lots, and key fabrication steps>

## Timeline
<bulleted list of phases with rough durations>

## Doctor coordination
<bulleted list of items the dentist needs to confirm or provide before fabrication starts>

## Open questions
<bulleted list of uncertainties — leave empty bullets only if truly nothing>
\`\`\`

# Rules
- Tailor to the product type (crown, aligner set, bridge, denture, etc.).
- If form data references lot numbers / shade / impressions, surface them in Materials.
- Keep total length under 350 words. The human will expand if needed.
- If patient is anonymous (no patientLabel), refer to "the patient" generically.
- Do not invent prices, due dates, or lot numbers that aren't in the input.
- Translate any Tagalog dental terms into clinical English.`,
};

export interface LabTreatmentPlanDraftInput {
  case: {
    refNumber: number | null;
    productName: string;
    urgency: 'STANDARD' | 'URGENT';
    patientLabel: string | null;
    doctorLabel: string | null;
    notes: string | null;
    formData: Record<string, unknown> | null;
  };
  /** Lot numbers + material names already used on the case, if any. */
  materialsUsed?: Array<{ material: string; lot: string }>;
}

export function renderLabTreatmentPlanUserMessage(
  input: LabTreatmentPlanDraftInput,
): string {
  const c = input.case;
  const lines: string[] = ['# Case context'];
  lines.push(
    `- Ref: ${c.refNumber !== null ? `#${c.refNumber}` : 'unassigned'}`,
  );
  lines.push(`- Product: ${c.productName}`);
  lines.push(`- Urgency: ${c.urgency}`);
  if (c.patientLabel) lines.push(`- Patient: ${c.patientLabel}`);
  if (c.doctorLabel) lines.push(`- Referring doctor: ${c.doctorLabel}`);
  if (c.notes) lines.push(`- Clinic notes: ${c.notes}`);

  if (c.formData && Object.keys(c.formData).length > 0) {
    lines.push('', '# Order form data');
    for (const [k, v] of Object.entries(c.formData)) {
      lines.push(`- ${k}: ${stringifyValue(v)}`);
    }
  }

  if (input.materialsUsed && input.materialsUsed.length > 0) {
    lines.push('', '# Materials already logged');
    for (const m of input.materialsUsed) {
      lines.push(`- ${m.material} (lot ${m.lot})`);
    }
  }

  lines.push('', 'Draft the treatment plan now.');
  return lines.join('\n');
}

function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return '[unserializable]';
  }
}
