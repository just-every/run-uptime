import ts from 'typescript';

export function sourceReader(file, fixtures) {
 const refuse = (node, reason) => {
  const {line} = file.getLineAndCharacterOfPosition(node.getStart(file));
  throw Error(`${file.fileName}:${line + 1}: ${reason}`);
 };
 const value = node => {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) {
   const path = []; let cursor = node;
   while (ts.isPropertyAccessExpression(cursor)) { path.unshift(cursor.name.text); cursor = cursor.expression; }
   if (!ts.isIdentifier(cursor) || cursor.text !== 'fixtures') refuse(node, 'unsupported value; use a literal or fixtures field');
   let result = fixtures;
   for (const key of path) { if (!result || !Object.hasOwn(result, key)) refuse(node, 'fixture field is missing'); result = result[key]; }
   return result;
  }
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(p => {
   if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name)) refuse(p, 'unsupported locator option');
   return [p.name.text, value(p.initializer)];
  }));
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  refuse(node, 'unsupported value; expressions are never executed');
 };
 const call = node => {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) refuse(node, 'unsupported call');
  return {receiver: node.expression.expression, name: node.expression.name.text, args: node.arguments};
 };
 const locator = node => {
  const {receiver, name, args} = call(node);
  if (!ts.isIdentifier(receiver) || receiver.text !== 'page') refuse(node, 'locator must start with page');
  if (['getByLabel', 'getByText', 'locator'].includes(name) && args.length === 1) return {[{getByLabel:'label',getByText:'text',locator:'css'}[name]]: value(args[0])};
  if (name === 'getByRole' && args.length === 2) {
   const options = value(args[1]);
   if (!options || Object.keys(options).join(',') !== 'name') refuse(node, 'role locator supports only name');
   return {role: value(args[0]), name: options.name};
  }
  refuse(node, 'unsupported locator');
 };
 return {refuse, value, call, locator};
}
