import type {FlowArtifacts} from './flow-artifacts.mjs';
import type {FailurePage} from './failure-page.mjs';
import type {DiagnosticPhases,NetworkDiagnostics} from './network-diagnostics.mjs';
export interface SafeValues {requestHeaders:string[];responseHeaders:string[];email:boolean}
export interface FailureSnapshot {
  artifacts?:FlowArtifacts;
  policyVersion?:number;
  safeValues?:SafeValues;
  screenshot?:FailurePage;
  phases?: DiagnosticPhases;
  diagnostics?: NetworkDiagnostics;
  version: 1;
  method: string;
  url: string;
  redirects: string[];
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  status: number | null;
  durationMs: number;
  body: string;
  bodyTruncated: boolean;
}
export const FAILURE_SNAPSHOT_LIMITS: Readonly<{version: 1; bodyBytes: 16384; totalBytes: 393216; redirects: 10; headers: 32; urlBytes: 2048; masks: 20; maskLength: 128}>;
export function captureFailureSnapshot(input: {
  method: string; url: string; redirects?: string[]; requestHeaders?: Record<string, string> | Headers;
  responseHeaders?: Record<string, string> | Headers; status?: number | null; body?: string; durationMs: number;
  requestSecrets?: string[]; masks?: string[]; phases?:DiagnosticPhases; diagnostics?:NetworkDiagnostics; safeValues?:SafeValues;screenshot?:FailurePage;policyVersion?:number;artifacts?:FlowArtifacts;
}): FailureSnapshot;
export type SnapshotResult = FailureSnapshot | {unavailable: 'capture_limit'};
export function normalizeFailureSnapshot(value: unknown): SnapshotResult;
export function tryCaptureFailureSnapshot(input: Parameters<typeof captureFailureSnapshot>[0]): SnapshotResult;
export const validateFailureSnapshot: typeof normalizeFailureSnapshot;

export function normalizeSafeValues(value:unknown):SafeValues;
export function redactSnapshotText(text:string,options?:{requestSecrets?:string[];masks?:string[];allowEmail?:boolean}):string;
