/* eslint-disable */
import axios from 'axios';

module.exports = async function () {
  // Most new specs use the harness's per-tenant axios — this default is
  // here for the legacy api.spec.ts. Defaults to the api's own port (4000),
  // overridable via API_E2E_URL or HOST/PORT.
  const url = process.env.API_E2E_URL;
  if (url) {
    axios.defaults.baseURL = url;
    return;
  }
  const host = process.env.HOST ?? 'localhost';
  const port = process.env.PORT ?? '4000';
  axios.defaults.baseURL = `http://${host}:${port}`;
};
