// Shared TypeScript interfaces and types for Query Lens React Flow UI

export interface AnalysisResult {
  functionName: string;
  filePath: string;
  totalQueries: number;
  queries: QueryRecord[];
  errors: string[];
  callChain: string[];
}

export interface QueryRecord {
  model: string;
  method: string;
  line: number;
  filePath: string;
  fullFilePath: string;
  calledFrom: string;
  callDepth: number;
  isInLoop: boolean;
  clientAlias: string;
  where?: string;
  select?: string;
  include?: string;
  orderBy?: string;
  take?: number;
  skip?: number;
  sql: string;
  rawQuery?: string;
}

export type OperationType = 'read' | 'write' | 'update' | 'delete' | 'raw';

export interface Suggestion {
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface AnalyzeParams {
  functionName: string;
  filePath: string;
  workspaceRoot: string;
}

export interface AnalysisStats {
  totalQueries: number;
  n1Count: number;
  uniqueModelCount: number;
  functionCount: number;
  maxDepth: number;
}

export interface FunctionNodeData {
  label: string;
  fileName: string;
  queryCount: number;
  isEntry: boolean;
  hasN1Warning: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export interface QueryNodeData {
  query: QueryRecord;
  operationType: OperationType;
  isHighlighted: boolean;
  isDimmed: boolean;
}
