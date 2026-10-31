import {renderAlerts} from './settings-alerts.js';
import {renderGeneral} from './settings-general.js';
import {renderPeople} from './settings-people.js';
import {renderIntegrations} from './settings-integrations.js';
import {renderBackup} from './settings-backup.js';
// Settings (/app/settings/<area>): the installation's configuration, one area per page, named in the order of the Settings
// menu (src/ui/console.html). This file only routes to the area's module; each module fills its cards once (data-owned), so
// the console's refresh keeps a draft, an open disclosure or a pending request.
export const AREAS={alerts:'Alerts',general:'General',people:'People',integrations:'Integrations',backup:'Backup and files'};
const RENDER={alerts:renderAlerts,general:renderGeneral,people:renderPeople,integrations:renderIntegrations,backup:renderBackup};
export function renderSettings(area,context){RENDER[area](context)}
