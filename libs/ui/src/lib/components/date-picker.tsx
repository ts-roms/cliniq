'use client';

// shadcn/ui "Date Picker" composition: a Button trigger that opens a Calendar
// in a Popover. Single-date only — reach for <Calendar mode="range"> directly
// when you need a range.

import * as React from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '../utils';
import { Button } from './button';
import { Calendar, type CalendarProps } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export interface DatePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  /** Shown on the trigger when nothing is selected. */
  placeholder?: string;
  /** date-fns format string for the trigger label. */
  displayFormat?: string;
  id?: string;
  'aria-label'?: string;
  disabled?: boolean;
  className?: string;
  /** Forwarded to <Calendar> (e.g. `disabled`, `fromDate`, `modifiers`). */
  calendarProps?: Omit<
    CalendarProps,
    'mode' | 'selected' | 'onSelect' | 'required'
  >;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  displayFormat = 'PPP',
  id,
  'aria-label': ariaLabel,
  disabled,
  className,
  calendarProps,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          aria-label={ariaLabel}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'justify-start text-left font-normal',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="size-4" />
          {value ? format(value, displayFormat) : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        // Land keyboard focus on the selected (or today's) day instead of the
        // prev-month chevron, which is what Radix would pick as the first
        // tabbable. react-day-picker marks exactly one day tabbable.
        onOpenAutoFocus={(e) => {
          const day = (
            e.currentTarget as HTMLElement
          ).querySelector<HTMLElement>(
            '[data-slot=calendar] button[tabindex="0"]',
          );
          if (day) {
            e.preventDefault();
            day.focus();
          }
        }}
      >
        <Calendar
          {...calendarProps}
          mode="single"
          selected={value}
          defaultMonth={value}
          onSelect={(date) => {
            onChange(date);
            if (date) setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
