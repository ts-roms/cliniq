// Run SOAP evals against ai-service. Set AI_SERVICE_URL + JWT_BEARER (optional).
//   pnpm nx run @org/ai-prompts:eval-soap
//
// Skips the actual model call when AI_SERVICE_URL is unset and falls back to
// a stub that echoes a minimal valid SOAP — useful for local CI smoke without
// burning Bedrock budget.

import { printAndExit, runEval } from '../runner.js';

const AI_URL = process.env.AI_SERVICE_URL ?? '';
const TOKEN = process.env.AI_SERVICE_TOKEN ?? '';

const result = await runEval('evals/soap/golden.jsonl', async (input) => {
  if (!AI_URL) {
    return stubResponse(input as { transcript: string; patient: Record<string, unknown> });
  }
  const res = await fetch(`${AI_URL}/ai/drafts/soap`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify({
      consultationId: 'eval',
      transcript: (input as { transcript: string }).transcript,
      patientContext: (input as { patient: Record<string, unknown> }).patient ?? {},
    }),
  });
  if (!res.ok) throw new Error(`ai-service ${res.status}`);
  const json = (await res.json()) as { draft: unknown };
  return json.draft;
});

printAndExit('SOAP', result);

function stubResponse(input: { transcript: string }) {
  if (input.transcript.length < 30) {
    return {
      subjective: { chiefComplaint: '' },
      objective: { vitals: null, physicalExam: {} },
      assessment: [],
      plan: [],
      uncertainty: ['transcript insufficient'],
    };
  }
  return {
    subjective: { chiefComplaint: 'Stub case from local runner' },
    objective: { vitals: null, physicalExam: {} },
    assessment: [{ problem: 'acute pharyngitis', icd10: 'J02.9', reasoning: 'stub' }],
    plan: [{ problem: 'acute pharyngitis', actions: ['symptomatic care'] }],
    uncertainty: [],
  };
}
