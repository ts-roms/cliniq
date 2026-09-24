-- Add the escalation window CriticalValueRule was always meant to carry.
--
-- LabsService.resolveFlag reads `rule.notifyWithinMinutes` to compute the
-- `dueAt` on a CriticalResultNotification, but the column was never added:
-- the field existed only in the service and in a doc comment. `nx typecheck`
-- caught it on main as
--
--     labs.service.ts(472,14): error TS2339:
--       Property 'notifyWithinMinutes' does not exist on type '{ ... }'
--
-- It reached main because the API's Docker build uses webpack + swc, which
-- strips types without checking them, so a missing property compiles
-- cleanly there. Only `tsc --build` sees it, and Nx silently no-ops in this
-- workspace's git worktrees — so the local verification had no step that
-- would have failed.
--
-- Per-analyte because urgency is: a critical potassium wants a phone call
-- inside minutes, an abnormal TSH does not. 60 minutes matches the constant
-- the service already falls back to, so existing rows keep today's behaviour.

ALTER TABLE "critical_value_rules"
  ADD COLUMN "notifyWithinMinutes" INTEGER NOT NULL DEFAULT 60;

-- A zero or negative window would make every result instantly overdue and
-- train people to ignore the escalation.
ALTER TABLE "critical_value_rules"
  ADD CONSTRAINT "critical_value_rules_notify_window_positive"
  CHECK ("notifyWithinMinutes" > 0);
