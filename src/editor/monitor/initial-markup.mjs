const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
// Render the URL's screen before browser modules or runner settings arrive.
export function initialMarkup(markup,search){
 const params=new URLSearchParams(search),editing=params.has('monitor'),checking=params.has('discovery');
 const heading=editing?'Edit monitor':params.has('first')?'Add your first monitor':'New monitor';
 const progress=editing?'Loading monitor…':checking?`Looking at ${params.get('website')||'your website'}${params.get('from')?` from ${params.get('from')}`:''}…`:'Loading locations…';
 return markup.replace('<h1>New monitor</h1>',`<h1>${heading}</h1>`)
  .replace('<p id="editor-notice"',`<p id="editor-loading" class="discovery-status" role="status" data-state="checking">${escape(progress)}</p><p id="editor-notice"`)
  .replace('aria-label="Check a website" hidden',`aria-label="Check a website"${editing||checking?' hidden':''}`)
  .replace('id="discovery-url" name=', 'id="discovery-url" disabled name=')
  .replace('id="discovery-check" type=', 'id="discovery-check" disabled type=');
}
