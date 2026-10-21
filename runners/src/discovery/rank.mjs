import {validateDefinition} from '../../../src/domain/policy.mjs';
import {MAX_PROPOSALS} from './constants.mjs';
// Keys normally identify the final URL; status components also identify the component on that URL.
// Duplicates collapse to the better-ranked one. Every retained proposal that answered 200 is pre-ticked, except status
// components, which are offered and never ticked.
// Anything that returned 404 or 5xx, matched a soft-404 canary or needs a sign-in never became a proposal in the first place.
export function finalize(proposals){
  const seen=new Set(),ordered=proposals.map((proposal,index)=>({proposal,index})).sort((a,b)=>a.proposal.rank-b.proposal.rank||a.index-b.index);
  const kept=[];
  for(const {proposal} of ordered){
    if(seen.has(proposal.key))continue;
    seen.add(proposal.key);kept.push(proposal);
  }
  return kept.slice(0,MAX_PROPOSALS).map(({rank,autoSelect=true,...proposal})=>{
    // The policy check is the contract with POST /api/monitors; a definition that fails it is a bug here, not input to hide.
    validateDefinition(proposal.definition,[]);
    return {...proposal,selected:autoSelect&&proposal.definition.assertions.status===200};
  });
}
