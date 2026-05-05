#!/usr/bin/env node
// Tiny stub of ai-service for CI. Listens on :4100, answers /ai/drafts/soap
// with a canned draft so the api → ai-service path can be exercised without
// invoking Bedrock or carrying AWS credentials in CI.

import { createServer } from 'node:http';

const PORT = Number(process.env.AI_STUB_PORT) || 4100;

const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/ai/drafts/soap') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body); } catch { parsed = {}; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        draft: {
          subjective: { chiefComplaint: 'Itchy red patches on forearm' },
          objective: { physicalExam: { skin: 'Erythematous papules, no excoriation' } },
          assessment: [{ problem: 'Allergic contact dermatitis', icd10: 'L23.9', reasoning: 'Acute onset, pruritic, localized' }],
          plan: [{ problem: 'Allergic contact dermatitis', actions: ['topical corticosteroid', 'avoid suspected allergen'] }],
          uncertainty: parsed.transcript?.length < 100 ? ['short transcript'] : [],
        },
        promptVersion: 'soap_v1',
        model: 'claude-sonnet-4-6-stub',
        inputTokens: 1500,
        outputTokens: 600,
        cacheReadTokens: 0,
        latencyMs: 12,
      }));
    });
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  console.log(`[stub-ai-service] listening on :${PORT}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
