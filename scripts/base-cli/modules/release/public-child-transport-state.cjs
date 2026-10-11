// Shared serialization for the fixture's Git and smart HTTP transport doubles.
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');

exports.withTransportState = function (path, update, operation) {
  const lock = path + '.lock', deadline = Date.now() + 10000;
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (;;) {
    try { fs.mkdirSync(lock); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) throw new Error('Timed out waiting for fixture transport state lock');
      Atomics.wait(pause, 0, 0, 10);
    }
  }
  let temporary;
  try {
    const state = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path)) : { heads: 0, fetches: 0 };
    update(state);
    temporary = path + '.' + process.pid + '.' + randomUUID() + '.tmp';
    const fd = fs.openSync(temporary, 'wx');
    try { fs.writeFileSync(fd, JSON.stringify(state)); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, path);
    temporary = undefined;
    return operation(state);
  } finally {
    try { if (temporary) fs.unlinkSync(temporary); } finally { fs.rmdirSync(lock); }
  }
};
