import { checkWebhookTarget, isPublicUnicast } from './webhook-target.js';

describe('isPublicUnicast', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.1.1',
    '169.254.169.254', // AWS/GCP metadata
    '100.64.0.1', // CGNAT
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('refuses %s', (addr) => {
    expect(isPublicUnicast(addr)).toBe(false);
  });

  it.each(['1.1.1.1', '8.8.8.8', '172.32.0.1', '192.167.1.1', '2606:4700::1'])(
    'allows %s',
    (addr) => {
      expect(isPublicUnicast(addr)).toBe(true);
    },
  );
});

describe('checkWebhookTarget', () => {
  it('refuses a non-URL', async () => {
    await expect(checkWebhookTarget('not a url')).resolves.toMatchObject({
      ok: false,
    });
  });

  it('refuses http by default', async () => {
    await expect(
      checkWebhookTarget('http://1.1.1.1/hook'),
    ).resolves.toMatchObject({ ok: false });
  });

  it('allows http when explicitly opted in', async () => {
    await expect(
      checkWebhookTarget('http://1.1.1.1/hook', { allowInsecure: true }),
    ).resolves.toMatchObject({ ok: true });
  });

  it('refuses non-http(s) schemes even with allowInsecure', async () => {
    await expect(
      checkWebhookTarget('file:///etc/passwd', { allowInsecure: true }),
    ).resolves.toMatchObject({ ok: false });
  });

  it('refuses credentials in the URL', async () => {
    await expect(
      checkWebhookTarget('https://user:pass@1.1.1.1/hook'),
    ).resolves.toMatchObject({ ok: false });
  });

  it('refuses the cloud metadata address', async () => {
    await expect(
      checkWebhookTarget('https://169.254.169.254/latest/meta-data/'),
    ).resolves.toMatchObject({ ok: false });
  });

  it('refuses a literal private address', async () => {
    await expect(
      checkWebhookTarget('https://10.0.0.5/hook'),
    ).resolves.toMatchObject({ ok: false });
  });

  it('allows a public literal address', async () => {
    await expect(
      checkWebhookTarget('https://1.1.1.1/hook'),
    ).resolves.toMatchObject({ ok: true });
  });

  it('allows a private host when the operator opts out of the check', async () => {
    await expect(
      checkWebhookTarget('https://10.0.0.5/hook', { allowPrivate: true }),
    ).resolves.toMatchObject({ ok: true });
  });
});
