-- Locations are named after where their runner runs (owner, 20 Oct 2026). named_by says who chose a runner's label:
-- 'default' (generated; the runner's place renames it when it next reaches Uptime), 'place' (named from that place) or
-- 'owner' (typed by the owner; never renamed). Existing labels were typed by the owner, except the built-in
-- 'owner-network', which takes a generated name now (the rule of src/domain/location-name.ts generatedName) and its
-- place's name on its runner's next contact.
ALTER TABLE runners ADD COLUMN named_by TEXT NOT NULL DEFAULT 'owner';
UPDATE runners SET named_by='default',
 network_label=json_extract('["Amber","Brisk","Cedar","Coral","Ember","Fern","Golden","Harbor","Jade","Maple","Misty","Quiet","River","Silver","Swift","Willow"]','$['||(instr('0123456789abcdef',lower(substr(runner_id,6,1)))-1)||']')||' '||json_extract('["Bay","Brook","Cove","Crest","Dale","Field","Glen","Grove","Hill","Lake","Meadow","Peak","Ridge","Shore","Vale","Wood"]','$['||(instr('0123456789abcdef',lower(substr(runner_id,7,1)))-1)||']')
 WHERE network_label='owner-network' AND runner_id LIKE 'self-%';
