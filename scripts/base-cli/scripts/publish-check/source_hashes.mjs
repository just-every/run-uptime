// Reuse the maintained Source serializer; never approximate JSON.stringify in
// another language. Input and output stay on private subprocess pipes.
import fs from 'node:fs';
import {hash, json} from '../../edition-authoring/files.mjs';
const values = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(values.map(value => hash(json(value)))));
