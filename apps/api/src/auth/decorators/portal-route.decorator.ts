import { SetMetadata } from '@nestjs/common';

export const IS_PORTAL_ROUTE_KEY = 'isPortalRoute';

/**
 * Marks a controller or handler as part of the patient portal surface.
 *
 * PortalScopeGuard refuses every request from a PATIENT-role JWT that is NOT
 * marked with this. Action-level RBAC (`@Requires`) is still the primary gate;
 * this is the backstop for the failure mode that produced the original hole —
 * a staff route gated on an action the PATIENT role happened to hold.
 *
 * Marking a route does not grant access: the handler still needs its own
 * `@Requires(...)`, and MeService still derives the patient id from the JWT
 * `pid` claim rather than from any param.
 */
export const PortalRoute = () => SetMetadata(IS_PORTAL_ROUTE_KEY, true);
