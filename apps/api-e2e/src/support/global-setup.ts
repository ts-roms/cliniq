import { waitForPortOpen } from '@nx/node/utils';

/* eslint-disable */
var __TEARDOWN_MESSAGE__: string;

module.exports = async function () {
  // Wait for the api to be reachable before any spec runs. The api serves
  // on port 4000 by default; override via API_E2E_URL or HOST/PORT.
  console.log('\nSetting up e2e...\n');

  const url = process.env.API_E2E_URL;
  let host = process.env.HOST ?? 'localhost';
  let port = process.env.PORT ? Number(process.env.PORT) : 4000;
  if (url) {
    try {
      const u = new URL(url);
      host = u.hostname;
      port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
    } catch {
      // fall through with defaults
    }
  }
  await waitForPortOpen(port, { host });

  globalThis.__TEARDOWN_MESSAGE__ = '\nTearing down e2e...\n';
};
