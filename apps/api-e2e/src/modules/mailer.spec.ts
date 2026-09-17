/**
 * mailer — service-only module (no HTTP surface to e2e-test).
 *
 * apps/api/src/mailer/ ships `MailerService` + `MailerModule` only. Other
 * modules inject the service to send transactional email (verification,
 * password reset, invoice receipts). No controller is mounted; there is no
 * /api/mailer/* route to exercise from a Jest e2e spec.
 *
 * Provider behavior (Resend success/fail, no-op fallback when RESEND_API_KEY
 * is unset) belongs in unit tests next to the service.
 */
describe('@org/api-e2e mailer module', () => {
  it.skip('service-only — no HTTP surface', () => {
    /* no controller at apps/api/src/mailer/ */
  });
});
