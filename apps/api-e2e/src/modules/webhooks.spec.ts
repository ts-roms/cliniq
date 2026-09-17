/**
 * /api/webhooks — service-only module (no HTTP surface to e2e-test).
 *
 * apps/api/src/webhooks/ ships a `WebhooksService` and `WebhooksModule` but
 * no controller. It is an OUTGOING signed-dispatch system: other modules
 * inject the service to fan out events to tenant-configured endpoints.
 * The signature secret + retry/backoff live entirely inside the service.
 *
 * There is no inbound /api/webhooks/* controller — verifying signed
 * outbound payloads is an integration concern (mock the HTTP target) that
 * lives next to the service unit tests, not here.
 */
describe('@org/api-e2e webhooks module', () => {
  it.skip('service-only — no HTTP surface', () => {
    /* see file header — no controller exists at apps/api/src/webhooks/ */
  });
});
