import {createWebhookProtocol} from '../base/modules/integrations/core/webhook.ts'
import {createSlackIncomingWebhookProtocol} from '../base/modules/integrations/slack/protocol.ts'
export function notificationProtocols(credential:{endpoint:string;signing_secret:string|null},credentialId:string){
 const resolve=async(id:string)=>{if(id!==credentialId)throw Error('Destination version mismatch');return credential.endpoint};
 return [createWebhookProtocol({resolveDestination:resolve,signingKey:async envelope=>{await resolve(envelope.destinationId);if(!credential.signing_secret)throw Error('Signing credential unavailable');return new TextEncoder().encode(credential.signing_secret)},timestampedBodySignature:{timestampHeader:'x-lamp-timestamp',signatureHeader:'x-lamp-signature'}}),createSlackIncomingWebhookProtocol({resolveDestination:resolve})]
}
