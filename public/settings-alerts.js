import {escape} from './console-format.js';
import {renderNotifications} from './notifications.js';
// Settings › Alerts: the notification destinations, what was sent and the scheduled reports (public/notifications.js), with
// the alerts help in the side column.
export function renderAlerts({area,right,data,api,action,readUnavailable}){renderNotifications({area,right,data,api,action,escape,readUnavailable})}
