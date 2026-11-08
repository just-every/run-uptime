import {identity,shape} from './archive-schema.ts'
// The historical label is retained as data, never as receiving authority.
export function validateNotificationAttribution(event:any){
 if(!Object.hasOwn(event,'preparedBy'))return
 const value=event.preparedBy
 shape(value,['agent','for','label'],'notification attribution')
 for(const person of [value.agent,value.for]){
  shape(person,['id','name'],'notification attribution person');identity(person.id,'attribution')
  if(typeof person.name!=='string'||!person.name.trim()||person.name.length>512||/[\x00-\x1f\x7f]/.test(person.name))throw Error('Invalid notification attribution name')
 }
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.for.id)||typeof value.label!=='string'||!value.label.trim()||value.label.length>1200||/[\x00-\x1f\x7f]/.test(value.label))throw Error('Invalid notification attribution')
}
