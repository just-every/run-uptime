#!/usr/bin/env node
import { main } from './base-cli/cli/main.mjs';
process.exitCode = await main();
