// A source of monitor definitions. Preview, apply and undo never know which source an entry came from: an importer
// only splits its file into entries and maps each entry to a definition-file entry, or says why it cannot: `unsupported`
// when the source feature has no Uptime equivalent, `refused` when the entry itself is invalid.
// The interface stays at what the known sources need:
// - UptimeRobot v3 and Better Stack return monitor lists as pages; `entries` receives the whole text and may read
//   several concatenated pages (see jsonValues in ../format.ts).
// - A Pingdom API capture includes recorded browser flows; `map` reports such an entry as unsupported, it is never
//   reduced to a URL check.
// - A Gatus configuration is YAML, not JSON; `entries` receives raw text, so an adapter parses its own format.
export type SourceEntry={index:number;label:string;value:any;version?:number}
export type Mapping=
 |{definition:Record<string,unknown>;differences:string[]}
 |{unsupported:string;differences?:string[]}
 |{refused:string}
export interface Importer{
 source:string
 label:string
 detect(text:string):boolean
 entries(text:string):SourceEntry[]
 map(entry:SourceEntry):Mapping
}
