// Parse syntax only. No import, eval, VM, test runner or buyer callback is executed.
import ts from 'typescript';
import {sourceReader} from './values.mjs';
import {FLOW_LIMITS} from '../../src/domain/flow.mjs';

export function translateSuite(name, text, fixtures) {
 const file = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
 const {refuse, value, call, locator} = sourceReader(file, fixtures);
 if (file.parseDiagnostics.length) refuse(file, 'invalid Playwright syntax');
 const tests = []; let playwright = false, fixtureImport = false;
 for (const statement of file.statements) {
  if (ts.isImportDeclaration(statement)) {
   const from = statement.moduleSpecifier.text, clause = statement.importClause;
   if (from === '@playwright/test' && !playwright && !clause?.isTypeOnly && !statement.attributes && !clause?.name && clause?.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.map(e=>e.name.text).sort().join(',') === 'expect,test' && clause.namedBindings.elements.every(e => !e.propertyName && !e.isTypeOnly && ['test','expect'].includes(e.name.text))) { playwright = true; continue; }
   if (from === './fixtures.json' && !fixtureImport && clause?.name?.text === 'fixtures' && !clause.isTypeOnly && !clause.namedBindings && (!statement.attributes || statement.attributes.elements.length === 1 && statement.attributes.elements[0].name.text === 'type' && statement.attributes.elements[0].value.text === 'json')) { fixtureImport = true; continue; }
   refuse(statement, 'unsupported import; only test/expect and ./fixtures.json are read');
  }
  if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression) || !ts.isIdentifier(statement.expression.expression) || statement.expression.expression.text !== 'test') refuse(statement, 'unsupported top-level construct');
  if (tests.length >= FLOW_LIMITS.maxFlowsPerInstallation) refuse(statement, 'suite exceeds the flow-monitor limit; split and review its intended coverage');
  const test = statement.expression, [title, callback] = test.arguments;
  if (test.arguments.length !== 2 || !ts.isStringLiteral(title) || !ts.isArrowFunction(callback) || !callback.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword) || !ts.isBlock(callback.body) || callback.parameters.length !== 1 || callback.typeParameters || callback.type) refuse(test, 'test needs a literal name and async ({page}) callback');
  const parameter = callback.parameters[0];
  if (!ts.isObjectBindingPattern(parameter.name) || parameter.initializer || parameter.name.elements.length !== 1 || parameter.name.elements[0].name.getText(file) !== 'page' || parameter.name.elements[0].propertyName || parameter.name.elements[0].initializer || parameter.name.elements[0].dotDotDotToken) refuse(parameter, 'only the page fixture is supported');
  const steps = [], outcomes = [];
  for (const line of callback.body.statements) {
   if (!ts.isExpressionStatement(line) || !ts.isAwaitExpression(line.expression)) refuse(line, 'unsupported statement; only awaited page actions and expectations are translated');
   const node = line.expression.expression, {receiver,name: method,args} = call(node);
   if (ts.isIdentifier(receiver) && receiver.text === 'page' && method === 'goto' && args.length === 1) { steps.push({kind:'goto',url:value(args[0])}); continue; }
   if (method === 'click' && args.length === 0) { steps.push({kind:'click',target:locator(receiver)}); continue; }
   if (method === 'fill' && args.length === 1) {
    const selected = ts.isNonNullExpression(args[0]) ? args[0].expression : args[0];
    if (!ts.isPropertyAccessExpression(selected) || !ts.isPropertyAccessExpression(selected.expression) || !ts.isIdentifier(selected.expression.expression) || selected.expression.expression.text !== 'process' || selected.expression.name.text !== 'env') refuse(args[0], 'fill needs process.env.NAME selected by fixture credentialRefs; literal secrets are refused');
    const reference = fixtures.credentialRefs?.[selected.name.text];
    if (typeof reference !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(reference)) refuse(args[0], 'fill environment name has no selected fixture credentialRef');
    steps.push({kind:'fill',target:locator(receiver),credentialRef:reference}); continue;
   }
   if (ts.isCallExpression(receiver) && ts.isIdentifier(receiver.expression) && receiver.expression.text === 'expect' && receiver.arguments.length === 1) {
    const subject = receiver.arguments[0]; let outcome;
    if (method === 'toBeVisible' && args.length === 0) outcome = {what:'element',target:locator(subject)};
    else if (method === 'toHaveURL' && args.length === 1 && ts.isIdentifier(subject) && subject.text === 'page') outcome = {what:'url',value:value(args[0]),match:'exact'};
    else refuse(node, 'unsupported expectation');
    steps.push({kind:'expect',...outcome}); outcomes.splice(0,outcomes.length,{id:'final-outcome',...outcome}); continue;
   }
   refuse(node, 'unsupported action; arbitrary code and network calls are refused');
  }
  if (!steps.length || steps[0].kind !== 'goto' || !outcomes.length || steps.at(-1).kind !== 'expect') refuse(test, 'each test needs an initial goto and at least one required expectation');
  tests.push({name:title.text,url:steps[0].url,type:'flow',network:fixtures.network??'public',intervalMs:300000,timeoutMs:60000,probes:['local-a','local-b'],flow:{intent:title.text,steps,outcomes,...(fixtures.flowFixtures?{fixtures:fixtures.flowFixtures}:{})}});
 }
 if (!playwright || !fixtureImport || !tests.length) refuse(file, 'suite needs test/expect, fixtures and at least one test');
 if (new Set(tests.map(t=>t.name)).size !== tests.length) refuse(file, 'test names must be unique');
 return tests;
}
