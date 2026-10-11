// Maintained operator-auth uses its token/challenge UUID as mail deliveryId.
// Erasure removes that authority; a captured sender cannot recreate its mail.
export const mailAuthority=`(EXISTS(SELECT 1 FROM oa_tokens WHERE id=?) OR EXISTS(SELECT 1 FROM oa_step_up_challenges WHERE id=?))`;
export function mailAuthorityValues(id:unknown){
 if(typeof id!=='string'||!id)throw Error('Authentication mail authority unavailable');
 return [id,id];
}
