import { all,statement,guard,quote,insist } from './storage.mjs';
const identifier=value=>value.replace(/[A-Z]/g,c=>c.toLowerCase());

export async function excludedDependentGuards(db,targets,replaceable) {
  if(!replaceable.length)return [];
  const tables=await all(db,"SELECT name,sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL ORDER BY name"),references=[];
  // REFERENCES is required in every FK declaration. Tables without that keyword have no
  // FKs, including D1's protected metadata tables which refuse PRAGMA inspection.
  for(const table of tables.filter(t=>/\bREFERENCES\b/i.test(t.sql)))for(const fk of await all(db,`PRAGMA foreign_key_list(${quote(table.name)})`)) {
    const parent=tables.find(t=>identifier(t.name)===identifier(fk.table))?.name??fk.table;
    if([fk.on_delete,fk.on_update].some(action=>['CASCADE','SET NULL','SET DEFAULT'].includes(action)))references.push({child:table.name,parent});
  }
  const affected=new Set(replaceable),protectedTables=new Map();
  let changed=true;
  while(changed) {
    changed=false;
    for(const {child,parent} of references)if(affected.has(parent)) {
      if(!targets.some(t=>t.name===child))protectedTables.set(child,parent);
      if(!affected.has(child)){affected.add(child);changed=true;}
    }
  }
  const guards=[];
  for(const [child,parent] of protectedTables) {
    // Conservatively refuse populated excluded dependents, including transitive actions.
    // Repeat this condition inside the atomic commit to catch rows added after validation.
    insist(!(await statement(db,`SELECT 1 FROM ${quote(child)} LIMIT 1`).first()),'excluded_destination_dependents:'+child+':'+parent,409);
    guards.push(guard(db,`NOT EXISTS(SELECT 1 FROM ${quote(child)})`));
  }
  return guards;
}
