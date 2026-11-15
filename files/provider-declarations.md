# Landed provider declarations read from main

Author: Run Edit Run fleet, 2026-11-15.

Read-only GraphQL request: one GitHub call across Oncall and Lamp.

## oncall

wrangler:
```json
"AUTH_LOCAL": "false",
    "MAIL_FROM": ""
```

deploy:
```json
[
  {
    "binding": "MAIL_PROVIDER",
    "environment": "MAIL_PROVIDER",
    "optional": true
  }
]
```

## lamp

wrangler:
```json
// Each surface has its own hostname, and each host has its own home page: the
    // app host's `/` is the Lamp landing page beside sign-in and the operator app,
    // and the page host's `/` is the public status page. Locally both are loopback
    // names on the same port. Equal hostnames fail at startup.
    "LAMP_PAGE_HOST": "localhost",
    "LAMP_APP_HOST": "127.0.0.1",
    // Local sample identity; without a provider key, mail requests fail explicitly.
    // Deployment setup supplies the buyer's verified sender.
    "MAIL_FROM_ADDRESS": "lamp@localhost.invalid",
    "MAIL_PROVIDER": "",
    "MAIL_FROM": "",
    "MAIL_RELAY_URL": ""
```

deploy:
```json
[
  {
    "binding": "MAIL_PROVIDER",
    "environment": "MAIL_PROVIDER",
    "optional": true
  }
]
```

Oncall omits MAIL_PROVIDER from Wrangler vars and declares an optional deploy secret. Lamp has an empty Wrangler placeholder and an optional deploy secret. Uptime's retained managed producer requires the public field; rer 0.2.118 rejects even an empty duplicate here. Uptime keeps its managed public SendGrid default and removes its redundant static deploy secret. The existing native adapter still creates effective selected-provider bindings dynamically.
