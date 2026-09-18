import * as React from 'react';
import { render } from '@testing-library/react-native';

import App from './App';

test('renders the login screen when not signed in', async () => {
  const { findByPlaceholderText } = render(<App />);
  // App shows a spinner while it restores the session from secure storage;
  // with no session it then settles on LoginScreen and its email input.
  expect(await findByPlaceholderText('you@clinic.ph')).toBeTruthy();
});
