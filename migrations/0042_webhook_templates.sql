-- Public request configuration is portable; endpoint/header values and signing
-- authority remain in the immutable encrypted credential version.
ALTER TABLE notification_destinations ADD COLUMN webhook_template TEXT;
-- A delivery's historical body is validated against its own configuration,
-- including after the destination has been edited or restored inactive.
ALTER TABLE notification_jobs ADD COLUMN webhook_template TEXT;
