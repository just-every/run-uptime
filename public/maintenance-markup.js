import {escape} from './console-format.js';
import {maintenanceTime,weekdayNames,modeDescription,windowDescription} from './maintenance-calendar.js';

export function maintenancePanel(m){
 const windows=m.definition.maintenanceWindows??[];
 return `<section class="ui-card panel maintenance-panel" aria-labelledby="planned-maintenance-heading"><h2 id="planned-maintenance-heading">Planned maintenance</h2><p>Quiet alerts during planned work.</p>${windows.length?`<ul class="maintenance-windows">${windows.map(window=>`<li><strong>${escape(window.name)}</strong><p>${escape(windowDescription(window))}</p><p>${escape(modeDescription(window.mode))}</p><button type="button" id="cancel-maintenance-${escape(window.id)}" data-cancel-maintenance="${escape(window.id)}">Cancel window</button></li>`).join('')}</ul>`:'<p>No planned windows.</p>'}<button type="button" id="plan-maintenance">Plan maintenance</button></section>`;
}
export function plannerFields(timeZone,start,fromDate,untilDate){
 return `<label class="dialog-field">Window name<input id="maintenance-name" name="name" required maxlength="100" autocomplete="off"></label>
 <div class="maintenance-grid"><label class="dialog-field">Schedule<select name="schedule" id="maintenance-schedule"><option value="once">One-time</option><option value="weekly">Weekly</option></select></label>
 <label class="dialog-field">IANA time zone<input id="maintenance-zone" name="timeZone" required value="${escape(timeZone)}" placeholder="America/New_York" aria-describedby="maintenance-calendar-policy"></label></div>
 <label class="dialog-field">During the window<select name="mode" id="maintenance-mode"><option value="suppress">Continue checks; suppress notifications</option><option value="pause">Pause execution and notifications</option></select></label>
 <div data-once><label class="dialog-field">Local start date and time<input type="datetime-local" name="startsLocal" id="maintenance-start" value="${escape(start)}" required></label></div>
 <fieldset data-weekly hidden disabled><legend>Weekly calendar</legend><fieldset class="maintenance-weekdays"><legend>Days of the week</legend>${weekdayNames.map((name,day)=>`<label><input type="checkbox" name="weekday" value="${day}">${name}</label>`).join('')}</fieldset>
 <div class="maintenance-grid"><label class="dialog-field">Local start time<input type="time" name="localTime" id="maintenance-local-time" value="02:00" required></label><label class="dialog-field">First date (inclusive)<input type="date" name="fromDate" id="maintenance-from-date" value="${fromDate}" required></label><label class="dialog-field">Last date (inclusive)<input type="date" name="untilDate" id="maintenance-until-date" value="${untilDate}" required></label></div></fieldset>
 <label class="dialog-field">Duration (elapsed minutes)<input type="number" name="duration" id="maintenance-duration" min="1" max="1440" step="1" value="60" required></label>
 <p class="ui-helper" id="maintenance-calendar-policy">Weekly windows skip a nonexistent local time when clocks move forward and use the first occurrence when clocks repeat. Duration is fixed elapsed minutes, so the local end time can shift. One-time windows use the first repeated start time; a nonexistent start must be changed.</p>`;
}
export function previewMarkup(preview){
 const zone=preview.window.timeZone;
 return `<h3 id="maintenance-preview-heading">Review maintenance</h3><p><strong>${escape(preview.window.name)}</strong> · ${escape(modeDescription(preview.window.mode))}</p><p>${escape(windowDescription(preview.window))}</p><p>Only these ${preview.monitors.length} selected monitors will change. Later group changes do not expand this selection.</p>
 <ul class="maintenance-revisions" tabindex="0" aria-label="Monitor revisions">${preview.monitors.map(m=>`<li>${escape(m.name)} <code>${escape(m.id)}</code> · revision ${escape(m.revision)}</li>`).join('')}</ul>
 <p>Preview period: ${escape(maintenanceTime(preview.from,zone))} – ${escape(maintenanceTime(preview.to,zone))}. All times below use ${escape(zone)}.</p>
 <p>${preview.occurrences.length} calendar occurrence${preview.occurrences.length===1?'':'s'}. Repeated hours use the first occurrence; nonexistent hours are skipped. Duration uses fixed elapsed minutes.</p>
 <ol class="maintenance-occurrences" tabindex="0" aria-label="Preview occurrences">${preview.occurrences.map(o=>o.status==='skipped-gap'?`<li>${escape(o.localDate)} ${escape(o.localTime)} — skipped: this local time does not exist.</li>`:`<li>${escape(maintenanceTime(o.startsAt,zone))} – ${escape(maintenanceTime(o.endsAt,zone))}${o.status==='first-repeat'?`<strong> · First repeated time</strong>; the second start at ${escape(maintenanceTime(o.repeatedStartsAt,zone))} is skipped.`:''}<span class="maintenance-utc">UTC: ${escape(new Date(o.startsAt).toISOString())} – ${escape(new Date(o.endsAt).toISOString())}</span></li>`).join('')}</ol>${preview.occurrences.length?'':'<p>No windows occur in this preview period.</p>'}`;
}
