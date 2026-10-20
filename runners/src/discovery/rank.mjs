import {validateDefinition} from '../../../src/domain/policy.mjs';
import {MAX_PROPOSALS,MAX_SELECTED} from './constants.mjs';
import {RANK} from './proposal.mjs';
// Keys normally identify the final URL; status components also identify the component on that URL.
// Duplicates collapse to the better-ranked one; the list is cut to 12 and the first 4 eligible proposals are pre-ticked.
// Anything that returned 404 or 5xx, matched a soft-404 canary or needs a sign-in never became a proposal in the first place.
export function finalize(proposals){
  const seen=new Set(),ordered=proposals.map((proposal,index)=>({proposal,index})).sort((a,b)=>a.proposal.rank-b.proposal.rank||a.index-b.index);
  const kept=[];
  for(const {proposal} of ordered){
    if(seen.has(proposal.key))continue;
    seen.add(proposal.key);kept.push(proposal);
  }
  let selectedCount=0;
  return kept.slice(0,MAX_PROPOSALS).map(({rank,autoSelect=true,...proposal})=>{
    // The policy check is the contract with POST /api/monitors; a definition that fails it is a bug here, not input to hide.
    validateDefinition(proposal.definition,[]);
    const selected=autoSelect&&selectedCount<MAX_SELECTED&&rank<RANK.more;
    if(selected)selectedCount++;
    return {...proposal,selected};
  });
}
