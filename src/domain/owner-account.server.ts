import type {AuthBindings} from './operator-auth.server.ts'

// Match Base's installation owner selection by stable account identity. The
// configured bootstrap email stays the authority for an unclaimed install.
export function ownerAccount(env:Pick<AuthBindings,'DB'>){
 return env.DB.prepare("SELECT o.id,o.email FROM oa_operators o LEFT JOIN oa_bootstrap b ON b.claim_id=o.id WHERE o.role='owner' AND o.status='active' ORDER BY b.claim_id IS NULL,o.created_at,o.id LIMIT 1").first<{id:string;email:string}>()
}
