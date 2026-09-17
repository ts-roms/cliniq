'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Check, ChevronDown, Loader2, Search } from 'lucide-react';
import { cn } from '@org/ui';

/**
 * Lightweight searchable picker. Built inline (no cmdk / Radix popover dep)
 * so it can ship as a single-file addition. Designed to wrap react-hook-form
 * via the `<Controller>` pattern: this component is fully controlled.
 *
 *   <Controller
 *     name="patientId"
 *     control={control}
 *     render={({ field }) => (
 *       <SearchSelect
 *         value={field.value}
 *         onChange={field.onChange}
 *         items={items}
 *         onQueryChange={setQuery}
 *         isLoading={query.isFetching}
 *         placeholder="Search patients..."
 *       />
 *     )}
 *   />
 *
 * The caller owns the search term and fetches items — this component is
 * presentational. Items are rendered exactly in the order received.
 */

export interface SearchSelectItem {
  /** Stable id passed back to `onChange` on selection. */
  id: string;
  /** Primary label shown in the list + input when selected. */
  label: string;
  /** Optional second line (MRN, role, email — caller's choice). */
  sublabel?: string;
}

export interface SearchSelectProps {
  /** Current selected id, or empty string for "no selection". */
  value: string;
  /** Called with the new id when the user picks an item. */
  onChange: (id: string) => void;
  /** Items to render. The list is shown as-is — caller does the filtering. */
  items: SearchSelectItem[];
  /** Called with the latest query text. Caller debounces / fetches. */
  onQueryChange?: (q: string) => void;
  /** Caller's fetch status — renders a spinner inside the input. */
  isLoading?: boolean;
  /** Placeholder shown when nothing is selected. */
  placeholder?: string;
  /** Empty-state copy when items.length === 0 (after loading). */
  emptyMessage?: string;
  /** Visual disabled state. */
  disabled?: boolean;
  /** Optional id for aria-labelledby wiring from <FormField>. */
  id?: string;
}

export function SearchSelect({
  value,
  onChange,
  items,
  onQueryChange,
  isLoading,
  placeholder = 'Search…',
  emptyMessage = 'No matches',
  disabled,
  id,
}: SearchSelectProps) {
  const reactId = useId();
  const inputId = id ?? `search-select-${reactId}`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // The currently-selected item, if it's in the loaded list. When the value
  // is set externally and the matching item isn't loaded yet (e.g. first
  // render with a defaultProviderId), we fall back to showing the id.
  const selected = useMemo(
    () => items.find((i) => i.id === value),
    [items, value],
  );

  // Close the popover on outside click.
  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: PointerEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onDocPointer);
    return () => document.removeEventListener('pointerdown', onDocPointer);
  }, [open]);

  // Reset highlight when the list changes.
  useEffect(() => {
    setActiveIdx(0);
  }, [items]);

  // Keep the active option in view as the user arrows through it.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${activeIdx}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  function handleQuery(next: string) {
    setQuery(next);
    setOpen(true);
    onQueryChange?.(next);
  }

  function handleSelect(item: SearchSelectItem) {
    onChange(item.id);
    setQuery('');
    setOpen(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      if (open && items[activeIdx]) {
        e.preventDefault();
        handleSelect(items[activeIdx]);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    }
  }

  // What goes in the input box:
  //   - the user's typed query while the popover is open
  //   - otherwise the selected item's label
  //   - if a value is set but its matching item hasn't loaded yet (initial
  //     fetch in flight), show "Loading…" so the input isn't deceptively
  //     empty when the form was constructed with a defaultValue
  //   - otherwise empty (placeholder shows through)
  const inputValue = open
    ? query
    : (selected?.label ?? (value && isLoading ? 'Loading…' : ''));

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={`${inputId}-listbox`}
          aria-activedescendant={
            open && items[activeIdx] ? `${inputId}-opt-${activeIdx}` : undefined
          }
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={inputValue}
          onChange={(e) => handleQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className={cn(
            'flex h-9 w-full rounded-md border border-input bg-background pl-8 pr-9 py-1 text-sm shadow-sm',
            'placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        />
        {isLoading ? (
          <Loader2
            aria-hidden
            className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
          />
        ) : (
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
        )}
      </div>

      {open && (
        <ul
          id={`${inputId}-listbox`}
          ref={listRef}
          role="listbox"
          className={cn(
            'absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md',
            'animate-in fade-in-0 zoom-in-95',
          )}
        >
          {items.length === 0 ? (
            <li className="px-2 py-1.5 text-muted-foreground">
              {isLoading ? 'Loading…' : emptyMessage}
            </li>
          ) : (
            items.map((item, idx) => {
              const isSelected = item.id === value;
              const isActive = idx === activeIdx;
              return (
                <li
                  key={item.id}
                  id={`${inputId}-opt-${idx}`}
                  data-idx={idx}
                  role="option"
                  aria-selected={isSelected}
                  onPointerDown={(e) => {
                    // pointerdown so the input's blur doesn't fire first.
                    e.preventDefault();
                    handleSelect(item);
                  }}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5',
                    isActive && 'bg-accent text-accent-foreground',
                  )}
                >
                  <Check
                    aria-hidden
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      isSelected ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{item.label}</div>
                    {item.sublabel && (
                      <div className="truncate text-xs text-muted-foreground">
                        {item.sublabel}
                      </div>
                    )}
                  </div>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
