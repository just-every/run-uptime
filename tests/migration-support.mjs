// Native Wrangler parser preserves SQL trigger bodies and quoted/comment delimiters.
import {createRequire} from 'node:module';
export const {unstable_splitSqlQuery:splitSql}=createRequire(import.meta.url)('wrangler');
