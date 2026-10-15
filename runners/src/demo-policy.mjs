// Node transports do not pass through the Worker's fetch guard.
export const demoMode=()=>process.env.RER_DEMO==='1';
export async function demoEffect(real,providerSuccess){
 return demoMode()?providerSuccess():real();
}
