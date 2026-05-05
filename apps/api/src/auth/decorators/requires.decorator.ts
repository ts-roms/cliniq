import { SetMetadata } from '@nestjs/common';
import type { Action } from '@org/auth';

export const REQUIRES_KEY = 'requires';
export const Requires = (...actions: Action[]) => SetMetadata(REQUIRES_KEY, actions);
