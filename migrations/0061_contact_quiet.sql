-- Contact quiet policy is installation-local dispatch authority, never a portable replay grant.
-- due_at remains the immutable confirmation anchor for delay and repeat cadence.
ALTER TABLE alert_contact_schedules ADD COLUMN quiet_rules TEXT;
ALTER TABLE alert_contact_schedules ADD COLUMN quiet_until INTEGER;
-- A timezone evaluation is valid through this real minute only. SQL admission
-- fails closed if a yielding claim crosses into the next minute before its write.
ALTER TABLE alert_contact_schedules ADD COLUMN quiet_checked_until INTEGER;
