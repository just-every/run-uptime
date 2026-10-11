import * as seed from './seed.mjs';
import {readSetupManifestBytes,createInstallerModel} from './setup-manifest.mjs';
const [manifestResponse,schemaResponse,optionsResponse]=await Promise.all([fetch('/rer-setup.json'),fetch('/SETUP.schema.json'),fetch('/model-options.json')]);
const manifest=readSetupManifestBytes(new Uint8Array(await manifestResponse.arrayBuffer()),new Uint8Array(await schemaResponse.arrayBuffer()));
export const { fields, safeKeys, product, branding, features, summaryDefaults, normalizeWebsite, safeDraft, initialDraft, secretReady, hostingKeys, hostingModel, setupModel, installInput, displayValue, summaryKeys, failureDetails, failureNote, mergeAgentDraft, derivePrefix, normalizeAutomaticDraft, setupGroups, readySummary, nextIncompleteGroup, setupProgress, fieldVisible, fieldDefinition, groupDefinition, groupKeys, secretScopes, nameKey } = createInstallerModel(manifest,seed,await optionsResponse.json());
