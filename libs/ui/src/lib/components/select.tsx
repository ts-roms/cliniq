// Minimal native <select> wrapper styled like the rest. Use Radix Select when
// we need rich UX (search, virtualization, async options).

import * as React from 'react';
import { cn } from '../utils';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        // Native <select> handles its own vertical alignment from `h-10`.
        // Adding `py-2` (as on <input>) clips ascenders/descenders in Chrome —
        // keep horizontal padding only and use `leading-tight` for breathing room.
        'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm leading-tight',
        'ring-offset-background focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
