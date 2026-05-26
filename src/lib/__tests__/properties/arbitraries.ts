// Shared fast-check arbitraries for property-based tests

import * as fc from 'fast-check';
import type { QueryRecord, AnalysisResult, AnalyzeParams } from '../../../types';
import {
  READ_METHODS,
  WRITE_METHODS,
  UPDATE_METHODS,
  DELETE_METHODS,
  RAW_METHODS,
} from '../../operationType';

const ALL_METHODS = [
  ...READ_METHODS,
  ...WRITE_METHODS,
  ...UPDATE_METHODS,
  ...DELETE_METHODS,
  ...RAW_METHODS,
];

/** Generates a non-empty identifier string (letters + digits, no slashes) */
const arbIdentifier = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,19}$/);

/** Generates a file path string */
const arbFilePath = fc
  .tuple(arbIdentifier, arbIdentifier)
  .map(([dir, file]) => `src/${dir}/${file}.ts`);

/** Generates a QueryRecord with random but valid fields */
export const arbQueryRecord = (calledFromOptions: string[]): fc.Arbitrary<QueryRecord> => {
  const calledFromArb =
    calledFromOptions.length > 0
      ? fc.constantFrom(...calledFromOptions)
      : arbIdentifier;

  return fc.record({
    model: arbIdentifier,
    method: fc.constantFrom(...ALL_METHODS),
    line: fc.integer({ min: 1, max: 9999 }),
    filePath: arbFilePath,
    fullFilePath: arbFilePath,
    calledFrom: calledFromArb,
    callDepth: fc.integer({ min: 0, max: 10 }),
    isInLoop: fc.boolean(),
    clientAlias: fc.constantFrom('prisma', 'db', 'client'),
    sql: fc.string({ minLength: 1, maxLength: 200 }),
  }).chain((base) =>
    fc.record({
      where: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
      select: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
      include: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
      orderBy: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
      take: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: undefined }),
      skip: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }),
    }).map((optional) => ({
      ...base,
      ...Object.fromEntries(
        Object.entries(optional).filter(([, v]) => v !== undefined)
      ),
    }))
  );
};

/**
 * Generates a valid AnalysisResult where all query.calledFrom values
 * are drawn from the callChain array (consistent data).
 */
export const arbAnalysisResult: fc.Arbitrary<AnalysisResult> = fc
  .array(arbIdentifier, { minLength: 1, maxLength: 5 })
  .chain((callChain) => {
    // Deduplicate callChain
    const uniqueChain = [...new Set(callChain)];
    if (uniqueChain.length === 0) {
      return fc.constant({
        functionName: 'emptyFn',
        filePath: 'src/empty.ts',
        totalQueries: 0,
        queries: [],
        errors: [],
        callChain: [],
      } as AnalysisResult);
    }

    return fc
      .array(arbQueryRecord(uniqueChain), { minLength: 0, maxLength: 8 })
      .map((queries) => ({
        functionName: uniqueChain[0],
        filePath: `src/${uniqueChain[0]}.ts`,
        totalQueries: queries.length,
        queries,
        errors: [],
        callChain: uniqueChain,
      }));
  });

/** Generates AnalyzeParams with random string values */
export const arbAnalyzeParams: fc.Arbitrary<AnalyzeParams> = fc.record({
  functionName: fc.string({ minLength: 1, maxLength: 50 }),
  filePath: fc.string({ minLength: 1, maxLength: 100 }),
  workspaceRoot: fc.string({ minLength: 0, maxLength: 100 }),
});

/** Generates AnalyzeParams where at least one required field is empty/whitespace */
export const arbInvalidAnalyzeParams: fc.Arbitrary<AnalyzeParams> = fc.oneof(
  // Empty functionName
  fc.record({
    functionName: fc.constantFrom('', '   ', '\t', '\n'),
    filePath: fc.string({ minLength: 1, maxLength: 100 }),
    workspaceRoot: fc.string({ minLength: 0, maxLength: 100 }),
  }),
  // Empty filePath
  fc.record({
    functionName: fc.string({ minLength: 1, maxLength: 50 }),
    filePath: fc.constantFrom('', '   ', '\t', '\n'),
    workspaceRoot: fc.string({ minLength: 0, maxLength: 100 }),
  }),
  // Both empty
  fc.record({
    functionName: fc.constantFrom('', '   '),
    filePath: fc.constantFrom('', '   '),
    workspaceRoot: fc.string({ minLength: 0, maxLength: 100 }),
  })
);
