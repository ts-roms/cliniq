import { SetMetadata } from '@nestjs/common';

export interface AuditMeta {
  /** Dot-namespaced action name, e.g. "patient.create", "rx.sign". */
  action: string;
  /** Logical entity type for indexing, e.g. "Patient". Optional. */
  entity?: string;
  /**
   * How to extract the entity id from the request/response. Default tries
   * `req.params.id` first, then `result.id`.
   */
  entityIdFrom?: 'param:id' | 'param:sid' | 'result:id' | 'body:id';
}

export const AUDIT_META_KEY = 'audit';
export const Audit = (meta: AuditMeta) => SetMetadata(AUDIT_META_KEY, meta);
