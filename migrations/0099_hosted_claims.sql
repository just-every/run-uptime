-- A Worker-owned scheduled check is claimed on its monitor row and its slot
-- is written once, with its attempts, when the check completes. The claim
-- holds the slot's delivery envelope until then. Existing slots are untouched.
ALTER TABLE monitors ADD COLUMN hosted_claim TEXT;
