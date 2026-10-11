// Reuse the seed's existing declarations; no parallel auth setting aliases.
export function localSettingKeys(project) {
 const manifest = project.setupManifest ?? project.setupSeed?.manifest;
 const claim = manifest?.steps.find(step => step.type === 'owner-claim');
 return {
  origin: project.adapter?.hooks?.secrets?.originKey ?? 'AUTH_ORIGIN',
  email: claim?.emailField ?? project.adapter?.input?.names?.email ?? 'OWNER_EMAIL',
 };
}

export function requiredLocalSettings(project, values) {
 const keys=localSettingKeys(project);
 const manifest=project.setupManifest ?? project.setupSeed?.manifest;
 return [...new Set([keys.email,keys.origin,...(manifest?.fields??[]).filter(field=>field.kind==='secret'&&field.required&&!field.when&&field.input!=='entered'&&field.name!==manifest?.steps.find(step=>step.type==='owner-claim')?.tokenField).map(field=>field.name)])].filter(name=>!values[name]);
}
