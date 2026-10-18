export type FailurePage={format:'png';width:1000;height:700;data:string}|{unavailable:string};
export const FAILURE_PAGE_BYTES:number;
export function normalizeFailurePage(value:unknown):FailurePage;
