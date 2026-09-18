import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
} from 'react';
import { Label } from '@org/ui';

export function FormField({
  label,
  error,
  children,
  htmlFor,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  /** Override when the child input's id is set by the caller. */
  htmlFor?: string;
}) {
  // If the caller didn't pass htmlFor, sniff the single child for an `id`
  // prop (FormField is typically used with one <Input/>). When neither is
  // present, mint a stable id via useId and clone the child to add it.
  // Net effect: <Label htmlFor=...> is always paired with the input,
  // unlocking getByLabel() in tests AND screen-reader association.
  const autoId = useId();
  // Only a lone element child gets the id wiring. Children.only() here
  // threw for any FormField wrapping a group (e.g. the broadcast form's
  // recipient chips + hint), which crashed /admin/settings client-side.
  const child = Children.count(children) === 1 ? Children.only(children) : null;
  let resolvedHtmlFor = htmlFor;
  let mappedChild: React.ReactNode = child ?? children;

  if (!resolvedHtmlFor && child !== null && isValidElement(child)) {
    const props = (child as ReactElement<{ id?: string }>).props;
    if (props?.id) {
      resolvedHtmlFor = props.id;
    } else {
      resolvedHtmlFor = autoId;
      mappedChild = cloneElement(child as ReactElement<{ id?: string }>, {
        id: autoId,
      });
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={resolvedHtmlFor}>{label}</Label>
      {mappedChild}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
