// Reads a job's output on stdin and writes the JSON failure body the wrapper sends: the output, cut to fit the 10 KiB ingress bound.
let chunks=[],size=0;for await(const chunk of process.stdin){if(size<8000){const kept=chunk.subarray(0,8000-size);chunks.push(kept);size+=kept.length}}
let output=Buffer.concat(chunks).toString("utf8"),body;while(Buffer.byteLength(body=JSON.stringify({output}))>10000)output=output.slice(0,-100);process.stdout.write(body);
