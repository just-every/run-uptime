import {validateDefinition} from '../../../src/domain/policy.mjs';
import {MAX_PROPOSALS,MAX_SELECTED} from './constants.mjs';
import {RANK} from './proposal.mjs';
// Duplicates (same final URL) collapse to the better-ranked one; the list is cut to 12 and the first 4 are pre-ticked,
// except the extra pages, which are offered and never ticked.
// Anything that returned 404 or 5xx, matched a soft-404 canary or needs a sign-in never became a proposal in the first place.
export function finalize(proposals){
  const seen=new Set(),ordered=proposals.map((proposal,index)=>({proposal,index})).sort((a,b)=>a.proposal.rank-b.proposal.rank||a.index-b.index);
  const kept=[];
  for(const {proposal} of ordered){
    if(seen.has(proposal.definition.url))continue;
    seen.add(proposal.definition.url);kept.push(proposal);
  }
  return kept.slice(0,MAX_PROPOSALS).map(({rank,...proposal},index)=>{
    // The policy check is the contract with POST /api/monitors; a definition that fails it is a bug here, not input to hide.
    validateDefinition(proposal.definition,[]);
    return {...proposal,selected:index<MAX_SELECTED&&rank<RANK.more};
  });
}
