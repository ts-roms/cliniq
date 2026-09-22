/* eslint-disable */

module.exports = async function () {
  // Deliberately does NOT kill the api port.
  //
  // The suite never starts the api — CI boots `apps/api/dist/main.js` itself
  // (see .github/workflows/ci.yml) and a developer runs `pnpm nx serve @org/api`
  // or the docker compose stack. `killPort(4005)` therefore killed a process
  // this suite does not own; on a dev machine that is docker's port proxy, and
  // taking it out brings the whole local stack down mid-audit.
  //
  // Whoever started the api is responsible for stopping it.
  console.log(globalThis.__TEARDOWN_MESSAGE__);
};
