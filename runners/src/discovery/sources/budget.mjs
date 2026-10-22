import {createBudget} from '../budget.mjs';
import {SOURCE_LIMITS} from '../../../../src/domain/discovery-sources.mjs';
// One run's allowance: the discovery crawl's own budget (requests, concurrency, wall clock, per-host spacing) at a source's size.
export const budgetFor=signal=>createBudget({requests:SOURCE_LIMITS.requests,concurrency:3,totalMs:90000,signal});
