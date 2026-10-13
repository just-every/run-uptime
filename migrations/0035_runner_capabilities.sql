-- What a runner reports about itself at enrolment (for now: whether it has a browser for flow monitors). Additive; a runner
-- that predates the report is shown as having none. Installation-local, like the runner row it extends.
ALTER TABLE runners ADD COLUMN capabilities TEXT NOT NULL DEFAULT '{}';
