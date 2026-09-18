import * as React from 'react';
import { render } from '@testing-library/react-native';

import App from './App';

// Rendering the full <App /> tree makes jest transform most of the Expo /
// React Native dependency graph on the first run. On a cold cache (every CI
// run) that alone takes ~20s, well past jest's default 5s test timeout.
const COLD_CACHE_TIMEOUT_MS = 90_000;

test(
  'renders the login screen when not signed in',
  async () => {
    const { findByPlaceholderText } = render(<App />);
    // App shows a spinner while it restores the session from secure storage;
    // with no session it then settles on LoginScreen and its email input.
    expect(await findByPlaceholderText('you@clinic.ph')).toBeTruthy();
  },
  COLD_CACHE_TIMEOUT_MS,
);
