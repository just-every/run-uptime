#!/usr/bin/env node
import { main } from '../cli/main.mjs';
process.exitCode = await main();
