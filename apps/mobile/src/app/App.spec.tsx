import * as React from 'react';
import { render } from '@testing-library/react-native';

import App from './App';

test('renders the login screen when not signed in', () => {
  const { getByPlaceholderText } = render(<App />);
  // No session → LoginScreen renders the email input.
  expect(getByPlaceholderText('you@clinic.ph')).toBeTruthy();
});
