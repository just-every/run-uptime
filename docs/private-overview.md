# Private monitor overview

The authenticated console reads `GET /api/overview` (or `?monitor=<id>` for one monitor). Each monitor may include the read-only `maintenanceEndsAt` number: the UTC Unix timestamp in milliseconds of the latest end among its currently active planned windows, weekly occurrences and quick `definition.maintenanceUntil` period. The field is absent when none is active. It uses the response's `now`; it does not change a definition, revision, health or alerting.
