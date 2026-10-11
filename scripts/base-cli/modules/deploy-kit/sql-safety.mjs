import { assert } from './validation.mjs';
import { sqlTokens } from './sql-tokens.mjs';

const reserved = new Set(['_rer_deploy_migrations', 'd1_migrations']);
const controls = new Set(['BEGIN', 'COMMIT', 'END', 'ROLLBACK', 'SAVEPOINT', 'RELEASE', 'ATTACH', 'DETACH', 'VACUUM']);
const needsOperand = new Set(['CASE', 'WHEN', 'THEN', 'ELSE', 'AND', 'OR', 'IS', 'NOT', 'IN', 'LIKE', 'GLOB', 'MATCH', 'REGEXP', 'BETWEEN', 'ESCAPE', 'COLLATE', 'AS', 'DISTINCT', 'FROM']);
const keyword = token => token?.kind === 'word' ? token.value.toUpperCase() : '';
const symbol = (token, value) => token?.kind === 'symbol' && token.value === value;

function createsTrigger(statement) {
  let index = 0;
  if (keyword(statement[index++]) !== 'CREATE') return false;
  if (['TEMP', 'TEMPORARY'].includes(keyword(statement[index]))) index++;
  return keyword(statement[index]) === 'TRIGGER';
}

function endsExpression(tokens, index) {
  const token = tokens[index];
  // After a function call or FILTER clause, OVER still needs its window.
  // Elsewhere SQLite permits OVER as an ordinary column or window name.
  if (keyword(token) === 'OVER' && symbol(tokens[index - 1], ')')) return false;
  return token && (['string', 'identifier', 'number'].includes(token.kind) ||
    (token.kind === 'word' && !needsOperand.has(keyword(token))) || symbol(token, ')'));
}

function triggerBegin(tokens) {
  let index = keyword(tokens[1]) === 'TRIGGER' ? 2 : 3;
  if (keyword(tokens[index]) === 'IF') {
    assert(keyword(tokens[index + 1]) === 'NOT' && keyword(tokens[index + 2]) === 'EXISTS', 'unsafe-migration-control');
    index += 3;
  }
  const afterName = start => symbol(tokens[start + 1], '.') ? start + 3 : start + 1;
  index = afterName(index);
  while (index < tokens.length && keyword(tokens[index]) !== 'ON') index++;
  index = afterName(index + 1);
  for (; index < tokens.length; index++) {
    if (keyword(tokens[index]) === 'BEGIN' && endsExpression(tokens, index - 1) && !symbol(tokens[index + 1], '.')) return index;
  }
  return -1;
}

function assertClosedExpressions(tokens) {
  const scopes = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (symbol(token, '(')) scopes.push('(');
    else if (keyword(token) === 'CASE') scopes.push('CASE');
    else if (symbol(token, ')')) assert(scopes.pop() === '(', 'unsafe-migration-control');
    // END may instead be an operand (THEN end) or a qualified identifier
    // (NEW.end). Only an END following a complete expression closes CASE.
    else if (keyword(token) === 'END' && scopes.at(-1) === 'CASE' &&
      endsExpression(tokens, index - 1) && !symbol(tokens[index + 1], '.')) scopes.pop();
  }
  assert(scopes.length === 0, 'unsafe-migration-control');
}

export function assertMigrationSqlSafe(sql) {
  const tokens = sqlTokens(sql);
  // SQLite also treats single-quoted text as identifiers and virtual-table
  // options as table names. Reserve exact controller names in every token.
  assert(tokens.every(token => !reserved.has(token.value.toLowerCase())), 'unsafe-migration-control');
  // ROLLBACK also controls transactions in ON CONFLICT / OR clauses and
  // RAISE(ROLLBACK, ...), without beginning a standalone SQL statement.
  assert(tokens.every(token => keyword(token) !== 'ROLLBACK'), 'unsafe-migration-control');
  let inTrigger = false;
  let statement = [];
  const finishStatement = () => {
    if (!statement.length) return;
    const first = keyword(statement[0]);
    if (inTrigger && first === 'END' && statement.length === 1) {
      inTrigger = false;
    } else {
      assert(!controls.has(first), 'unsafe-migration-control');
      if (createsTrigger(statement)) {
        const begin = triggerBegin(statement);
        assert(!inTrigger && begin >= 0, 'unsafe-migration-control');
        // Header CASE expressions must close before BEGIN; body expressions
        // must close before each semicolon, never at the trigger's final END.
        assertClosedExpressions(statement.slice(0, begin));
        const body = statement.slice(begin + 1);
        assert(body.length > 0 && !controls.has(keyword(body[0])), 'unsafe-migration-control');
        assertClosedExpressions(body);
        inTrigger = true;
      } else assertClosedExpressions(statement);
    }
    statement = [];
  };
  for (const token of tokens) {
    if (symbol(token, ';')) finishStatement();
    else statement.push(token);
  }
  finishStatement();
  assert(!inTrigger, 'unsafe-migration-control');
}
