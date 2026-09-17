/**
 * sms — service-only module (no HTTP surface to e2e-test).
 *
 * apps/api/src/sms/ ships `SmsService` + `SmsModule` only — used by the
 * tele module to text join links and by appointment reminders. No
 * controller is mounted; there is no /api/sms/* route to exercise.
 *
 * Provider integration (Twilio/Vonage/no-op) is unit-tested next to the
 * service.
 */
describe('@org/api-e2e sms module', () => {
  it.skip('service-only — no HTTP surface', () => {
    /* no controller at apps/api/src/sms/ */
  });
});
