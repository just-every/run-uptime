export type Cell = null | string | number | { blob: string };
export type Row = Record<string, Cell>;
export interface Column { name: string; type: string; notnull: number; pk: number; generated?: 'virtual'|'stored' }
export interface Table { name: string; sql: string; columns: Column[]; dependencies: string[]; count: number; rowidAlias: string|null }
export interface ObjectDescriptor { bucket: string; key: string; size: number; sha256: string; httpMetadata: Omit<R2HTTPMetadata,'cacheExpiry'> & {cacheExpiry?:string}; customMetadata: Record<string,string> }
export interface PayloadDescriptor { name: string; size: number; sha256: string }
export interface Manifest {
  kind: 'manifest'; format: 'runeditrun-portability'; version: 1; product: string; exportedAt: string; sourceIdentity: string;
  schema: string; tables: Table[]; objects: ObjectDescriptor[]; payloads: PayloadDescriptor[];
  excludedTables: string[]; excludedColumns: Record<string,string[]>; requiredConfiguration: string[]; partCount: number; epoch: number; journal: string[];
}
export type Item = {kind:'row';table:string;index:number;row:Row;rowid?:number} | {kind:'object';bucket:string;key:string;offset:number;data:string} | {kind:'payload';name:string;offset:number;data:string};
export interface Part {kind:'part';index:number;items:Item[];sha256:string}
export interface Closing {kind:'closing';partCount:number;contentHash:string}
export interface LaterJournal {sourceIdentity:string;epoch:number;journal:string[]}
export interface Staged {
  db: D1Database; tables: Record<string,string>; manifest: Manifest;
  read(table:string): Promise<Record<string,unknown>[]>;
}
export interface ArchivePolicy {
  product: string; excludeTables?: string[]; includeTables?: string[]; derivedTables?: string[];
  secretColumns?: Record<string,string[]>; exportRow?: (table:string,row:Row)=>Row;
  replaceableTables?: string[]; requiredConfiguration?: string[]; validateStaged?: (staged:Staged)=>boolean|void|Promise<boolean|void>;
  acceptedSchemas?: Record<string,{upgradeRow:(table:string,row:Row)=>Row}>;
  buckets?: Record<string,{prefix?:string;objectReferences?:{table:string;keyColumn:string}}>;
  extraPayloads?: Record<string,{produce:()=>Uint8Array|ReadableStream<Uint8Array>|Promise<Uint8Array|ReadableStream<Uint8Array>>;consume:(source:ReadableStream<Uint8Array>,descriptor:PayloadDescriptor)=>void|Promise<void>}>;
  partBytes?: number;
}
export interface Status {id:string;kind:'export'|'import';phase:'building'|'staging'|'applying'|'complete'|'aborted';completed:number;total:number|null;contentHash:string|null;requiredConfiguration?:string[]}
export interface PortabilityOptions {db:D1Database;buckets?:Record<string,R2Bucket>;policy:ArchivePolicy}
export interface Portability {
  exports: {create(actor?:string):Promise<string>;advance(id:string,options?:{expectedPart?:number;maxParts?:number}):Promise<Status>;status(id:string):Promise<Status>;download(id:string):Promise<ReadableStream<Uint8Array>>;abort(id:string):Promise<Status>};
  imports: {create(manifest:Manifest,actor?:string):Promise<string>;uploadPart(id:string,index:number,part:Part):Promise<Status>;finalize(id:string,options?:{contentHash?:string;laterJournal?:LaterJournal}):Promise<Status>;status(id:string):Promise<Status>;abort(id:string):Promise<Status>};
  status(id:string):Promise<Status>;actor(id:string):Promise<string>;
  erasureStatements(table:string,primaryKey:Record<string,Cell>):Promise<D1PreparedStatement[]>;
  invalidateTransfersStatements():Promise<D1PreparedStatement[]>;
}
export function createPortability(options:PortabilityOptions):Promise<Portability>;
export interface HandlerOptions extends PortabilityOptions {
  appOrigin:string;basePath?:string;maxBodyBytes?:number;
  authorize:(request:Request,context:{operation:'export'|'import'|'unknown';jobId:string|null})=>string|null|Promise<string|null>;
}
export function createPortabilityHandler(options:HandlerOptions):Promise<(request:Request)=>Promise<Response|null>>;
export function archiveLines(source:ReadableStream<Uint8Array>,maxLineBytes:number):AsyncGenerator<string>;
export function readArchive(source:ReadableStream<Uint8Array>,options?:{maxLineBytes?:number;partBytes?:number}):AsyncGenerator<Manifest|Part|Closing>;
export function makePart(index:number,items:Item[]):Promise<Part>;
export function canonicalJson(value:unknown):string;
export function sha256(value:string|Uint8Array):Promise<string>;
export const MAX_LINE_BYTES:number;
export const MAX_PART_BYTES:number;
export class PortabilityError extends Error {code:string;status:number;constructor(code:string,status?:number)}
