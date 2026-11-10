-- An agent's work is audited under the agent's own identifier, never under "<agent> for <person>", which names the person.
-- Rewrite the labels already written (audit actors, route-change actors, timeline features) to the non-personal stand-in; every row, count and time stays.
UPDATE uptime_audit SET actor_ref='agent:legacy' WHERE actor_kind='feature' AND instr(actor_ref,' for ')>0;
UPDATE alert_route_changes SET actor_ref='agent:legacy' WHERE instr(actor_ref,' for ')>0;
UPDATE incident_timeline SET data=json_set(data,'$.feature','agent:legacy') WHERE kind IN('pause_applied','maintenance_applied') AND instr(json_extract(data,'$.feature'),' for ')>0;
