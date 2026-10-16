// A failure the owner reads in the console: plain, one line, within the Worker's limit.
const ERROR_MAX=200;
export const failureText=(error,prefix)=>{const detail=String(error?.message??error).replace(/[\x00-\x1f\x7f]+/g,' ').replace(/\s+/g,' ').trim();return (prefix+(detail?`: ${detail}`:'.')).slice(0,ERROR_MAX)};
