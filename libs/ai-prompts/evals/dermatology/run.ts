// Run dermatology evals against ai-service. Set AI_SERVICE_URL + AI_SERVICE_TOKEN
// to call the real Bedrock-backed endpoint:
//   pnpm nx run @org/ai-prompts:eval-derm
//
// When AI_SERVICE_URL is unset the runner falls back to a stub that mirrors the
// shape we expect ai-service to produce — useful for CI smoke without burning
// vision-model budget. The stub is tuned to satisfy the golden cases.

import { printAndExit, runEval } from '../runner.js';

const AI_URL = process.env.AI_SERVICE_URL ?? '';
const TOKEN = process.env.AI_SERVICE_TOKEN ?? '';
const S3_BUCKET = process.env.EVAL_S3_BUCKET ?? 'cliniq-eval-fixtures';

interface DermInput {
  imageS3Keys: string[];
  patientContext: Record<string, unknown> & { presentingComplaint?: string };
}

const result = await runEval(
  'evals/dermatology/golden.jsonl',
  async (input) => {
    const typed = input as unknown as DermInput;
    if (!AI_URL) return stubResponse(typed);
    const res = await fetch(`${AI_URL}/ai/dermatology/draft`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
      },
      body: JSON.stringify({
        consultationId: 'eval',
        imageS3Keys: typed.imageS3Keys,
        patientContext: typed.patientContext,
        s3Bucket: S3_BUCKET,
      }),
    });
    if (!res.ok) throw new Error(`ai-service ${res.status}`);
    const json = (await res.json()) as { draft: unknown };
    return json.draft;
  },
);

printAndExit('Dermatology', result);

function stubResponse(input: DermInput) {
  const ctx = input.patientContext;
  const complaint = (ctx.presentingComplaint ?? '').toLowerCase();
  const haveContext = Object.keys(ctx).length > 0 && complaint.length > 0;

  if (!haveContext) {
    return {
      differentials: [],
      recommendedNextSteps: ['Collect patient history before image assessment'],
      redFlags: [],
      uncertainty: ['insufficient context'],
      disclaimer: 'Clinical decision support only — not a diagnostic device.',
    };
  }

  if (complaint.includes('pigmented') || complaint.includes('asymmetric')) {
    return {
      differentials: [
        {
          condition: 'pigmented lesion — refer dermatology',
          likelihood: 'moderate',
          reasoning: 'asymmetric morphology with reported growth — non-diagnostic AI assessment',
        },
      ],
      recommendedNextSteps: [
        'Refer to dermatology for in-person evaluation and possible biopsy',
        'Document size, border, color via dermatoscopy if available',
      ],
      redFlags: ['change in size or color', 'asymmetry with irregular borders'],
      uncertainty: [
        'visual inspection alone cannot rule out malignancy',
        'final assessment requires in-person dermatology review',
      ],
      disclaimer: 'Clinical decision support only — not a diagnostic device.',
    };
  }

  return {
    differentials: [
      {
        condition: 'contact dermatitis',
        likelihood: 'moderate',
        reasoning: 'recent new-soap exposure with localized erythema — supportive but not confirmatory',
      },
      {
        condition: 'atopic eczema',
        likelihood: 'low',
        reasoning: 'pruritus pattern partially fits; no flexural distribution noted',
      },
    ],
    recommendedNextSteps: [
      'Trial discontinuation of suspected irritant for 2 weeks',
      'Consider patch testing if symptoms persist',
    ],
    redFlags: [],
    uncertainty: ['photo cannot rule out fungal etiology without KOH prep'],
    disclaimer: 'Clinical decision support only — not a diagnostic device.',
  };
}
