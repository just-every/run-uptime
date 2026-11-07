-- ROUTING-001 geographic region routing: the country (ISO 3166 alpha-2) a location's runner connects from, taken from its
-- request place the first time that place is known, or typed by the owner. Region filters match it for the probes a
-- confirmed alert names. The country stays installation-local and is not an archive field.
ALTER TABLE runners ADD COLUMN country TEXT;
