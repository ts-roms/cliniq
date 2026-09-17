/**
 * ai-client — service-only module (no HTTP surface to e2e-test).
 *
 * apps/api/src/ai-client/ ships `AiClientService` + `AiClientModule` only.
 * It is a thin HTTP client around AI_SERVICE_URL that other modules
 * (consults, prescriptions, lab) inject for AI assist features. There is
 * no /api/ai-client/* controller; consumer modules expose their own
 * gated routes (e.g. /api/consultations/.../ai-summary) which are covered
 * by their own specs.
 */
describe('@org/api-e2e ai-client module', () => {
  it.skip('service-only — no HTTP surface', () => {
    /* no controller at apps/api/src/ai-client/ */
  });
});
