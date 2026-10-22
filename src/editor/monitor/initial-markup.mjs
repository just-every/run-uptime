import {editorState} from '../../ui/monitor-editor-path.mjs';
// Render the URL's screen before browser modules or runner settings arrive.
export function initialMarkup(markup,path){
 const state=editorState(path),editing=!!state.id,checking=!!state.discovery;
 const heading=editing?'Edit monitor':'New monitor';
 const progress=editing?'Loading monitor…':checking?'Looking at your website…':'Loading locations…';
 return markup.replace('<h1>New monitor</h1>',`<h1>${heading}</h1>`)
  .replace('<p id="editor-notice"',`<p id="editor-loading" class="discovery-status" role="status" data-state="checking">${progress}</p><p id="editor-notice"`)
  .replace('aria-label="Check a website" hidden',`aria-label="Check a website"${editing||checking?' hidden':''}`)
  .replace('id="discovery-url" name=', 'id="discovery-url" disabled name=')
  .replace('id="discovery-check" type=', 'id="discovery-check" disabled type=');
}
