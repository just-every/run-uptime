import { build, type Plugin } from 'vite';

// The location runner as one script, served at /uptime-runner.mjs (src/domain/runner-script.server.ts) for the console's Add
// location command, so a machine adding a location needs Node and no Uptime checkout. `virtual:uptime-runner` exports
// runners/src/standalone.mjs and everything it imports, bundled for Node when Vite loads it, in dev and at build. Playwright
// stays external: a machine with it installed runs browser flows, one without reports no browser.

export const runnerScriptId = 'virtual:uptime-runner';
const resolvedId = `\0${runnerScriptId}`;

export function runnerScript(): Plugin {
  let root = process.cwd();
  return {
    name: 'uptime:runner-script',
    configResolved(config) {
      root = config.root;
    },
    resolveId(id) {
      if (id === runnerScriptId) return resolvedId;
    },
    async load(id) {
      if (id !== resolvedId) return;
      const result = await build({
        configFile: false, root, logLevel: 'warn',
        build: { ssr: 'runners/src/standalone.mjs', write: false, minify: true, target: 'node22', rolldownOptions: { external: ['playwright'], output: { format: 'es', codeSplitting: false } } },
        ssr: { noExternal: true, target: 'node' },
      });
      const chunk = (Array.isArray(result) ? result : [result]).flatMap(output => 'output' in output ? output.output : []).find(output => output.type === 'chunk');
      if (!chunk) throw Error('The location runner did not build');
      for (const file of chunk.moduleIds) if (!file.startsWith('\0')) this.addWatchFile(file);
      return `export default ${JSON.stringify(chunk.code)};\n`;
    },
  };
}
