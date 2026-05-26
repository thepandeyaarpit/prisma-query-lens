import type { OperationType } from '../types';

export const READ_METHODS = new Set([
  'findMany', 'findFirst', 'findUnique', 'findUniqueOrThrow', 'findFirstOrThrow',
  'count', 'aggregate', 'groupBy',
]);
export const WRITE_METHODS = new Set(['create', 'createMany', 'upsert']);
export const UPDATE_METHODS = new Set(['update', 'updateMany']);
export const DELETE_METHODS = new Set(['delete', 'deleteMany']);
export const RAW_METHODS = new Set([
  '$queryRaw', '$executeRaw', '$queryRawUnsafe', '$executeRawUnsafe',
]);

export function getOperationType(method: string): OperationType {
  if (READ_METHODS.has(method)) return 'read';
  if (WRITE_METHODS.has(method)) return 'write';
  if (UPDATE_METHODS.has(method)) return 'update';
  if (DELETE_METHODS.has(method)) return 'delete';
  if (RAW_METHODS.has(method)) return 'raw';
  return 'read';
}

export function isReadMethod(method: string): boolean {
  return READ_METHODS.has(method);
}
