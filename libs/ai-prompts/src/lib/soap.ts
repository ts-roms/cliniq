// SOAP scribe prompt — current production version is v1.
// Template a stable system block + per-call patient context + transcript.
// See docs/08-ai-prompts-and-evals.md for the full discipline.

export const SOAP_V1 = {
  id: 'soap_v1' as const,
  modelHint: 'sonnet' as const,
  systemPrompt: `# Role
You are a clinical scribe for a licensed Filipino physician. Convert a consultation
transcript into a structured SOAP note, taking the patient's prior history into
account but never letting it override what the doctor said in this visit.

# Output format
Return STRICT JSON matching the schema below. No prose outside the JSON. No code fences.

{
  "subjective": {
    "chiefComplaint": string,
    "hpi": string,
    "ros": { string: string }
  },
  "objective": {
    "vitals": { ... } | null,
    "physicalExam": { string: string }
  },
  "assessment": [
    { "problem": string, "icd10": string | null, "reasoning": string }
  ],
  "plan": [
    { "problem": string, "actions": string[] }
  ],
  "uncertainty": string[]
}

# Rules
- Use only information present in the transcript or patient context. Mark guesses in "uncertainty".
- Past visits and known conditions are background only — restate a problem in the
  Assessment if the doctor addresses it this visit, otherwise do not list it.
- Never invent vitals, lab results, or medication names not stated.
- Use generic drug names. If brand was said, include both: "amoxicillin (Amoxil)".
- Translate Tagalog medical terms (ubo=cough, lagnat=fever, sipon=colds) into clinical English.
- Keep HPI in third person ("Patient reports...").
- ICD-10 only when confident; otherwise null.
- If transcript is too short or unclear, return JSON with "uncertainty": ["transcript insufficient"] and minimal content.`,
};

export interface RecentVisitSummary {
  date: string;        // YYYY-MM-DD
  assessment: string;  // collapsed prose
  icd10: string[];
}

export interface SoapDraftInput {
  patientContext: {
    age?: number;
    sex?: string;
    allergies?: string[];
    activeMedications?: string[];
    recentMedications?: string[];
    activeConditions?: string[];
    knownConditions?: string[];
    chiefComplaint?: string;
    recentVisits?: RecentVisitSummary[];
  };
  transcript: string;
}

export function renderSoapUserMessage(input: SoapDraftInput): string {
  const ctx = input.patientContext;
  const lines: string[] = ['# Patient context'];
  if (ctx.age != null) lines.push(`- Age: ${ctx.age}`);
  if (ctx.sex) lines.push(`- Sex: ${ctx.sex}`);
  if (ctx.allergies?.length) lines.push(`- Allergies: ${ctx.allergies.join(', ')}`);
  if (ctx.activeMedications?.length)
    lines.push(`- Current meds: ${ctx.activeMedications.join(', ')}`);
  if (ctx.recentMedications?.length)
    lines.push(`- Recent meds (12 mo): ${ctx.recentMedications.join(', ')}`);
  if (ctx.activeConditions?.length)
    lines.push(`- Active conditions: ${ctx.activeConditions.join(', ')}`);
  if (ctx.knownConditions?.length)
    lines.push(`- Known conditions / prior dx: ${ctx.knownConditions.join(', ')}`);
  if (ctx.chiefComplaint) lines.push(`- Chief complaint: ${ctx.chiefComplaint}`);

  if (ctx.recentVisits?.length) {
    lines.push('', '# Recent visits (most recent first)');
    for (const v of ctx.recentVisits) {
      const icd = v.icd10.length ? ` [${v.icd10.join(', ')}]` : '';
      lines.push(`- ${v.date}${icd}: ${v.assessment || '(no recorded assessment)'}`);
    }
  }

  lines.push('', '# Transcript', input.transcript);
  return lines.join('\n');
}
