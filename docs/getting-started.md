Uptime runs on your own computer first, which is the quickest way to try it. Open a terminal (on a Mac, Terminal in Applications → Utilities; on Windows, your WSL2 distribution), copy this line into it and press Enter:

```sh
curl -fsSL https://runeditrun.com/install.sh | sh -s -- dev just-every/run-uptime
```

Git is required; rer brings Node and pnpm. Already have Node 22 or later? `npx -y @runeditrun/rer dev just-every/run-uptime` does the same.

The line installs `rer`, the Run Edit Run command, clones Uptime into a `run-uptime` folder, installs everything and starts the app, its private runner and a practice target, with you as the owner. A first launch can take several minutes. When it is ready it prints `RER_READY` with the address: open it and complete the browser sign-in handoff from `rer dev` on the same computer, and keep that sign-in private. This free copy runs only on your computer: it sends no email, and nobody else can open it.

If the installer prints a line that puts `rer` on your PATH, run that line too. To start Uptime again later, run the same line from the same folder, or `cd run-uptime && rer dev`. `rer dev --stop` stops it.

Next: [Install Uptime](/docs/install) covers choosing the owner yourself and finishing setup, and [Deploy to Cloudflare](/docs/deploy) puts Uptime on the internet.
