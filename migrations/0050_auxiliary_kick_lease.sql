-- OPS-001: 0049 copied every monitoring_watch row, including the hosted console's
-- 'console-worker-kick' concurrency lease. That lease never sends anything, so it
-- is not auxiliary delivery evidence, and the archive refuses it on export.
DELETE FROM auxiliary_attempts WHERE scope='watch' AND job_id='console-worker-kick';
