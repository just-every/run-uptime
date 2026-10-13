import {DefinitionFileError} from '../format.ts'
import {nativeImporter} from './native.ts'
import {uptimeRobotImporter} from './uptimerobot.ts'
import type {Importer} from './types.ts'
export type {Importer,Mapping,SourceEntry} from './types.ts'

export const importers:Importer[]=[nativeImporter,uptimeRobotImporter]
export const HISTORY_SOURCE='uptimerobot-log'
export const SOURCES=['auto',...importers.map(i=>i.source),HISTORY_SOURCE]
export function selectImporter(text:string,source='auto'){
 if(!SOURCES.includes(source))throw new DefinitionFileError(`Unknown source “${source.slice(0,40)}”. Use one of: ${SOURCES.join(', ')}.`)
 if(source!=='auto')return importers.find(i=>i.source===source)??null
 return importers.find(i=>i.detect(text))??null
}
