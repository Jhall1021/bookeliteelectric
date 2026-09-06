/**
 * Structural audit of Platform Admin source — by syntax tree, not by spelling.
 *
 * The first Phase 2 verifier held its promises with regular expressions, and
 * review found the shapes they did not spell: an aliased `headers as h`, a
 * bare side-effect import, a runtime re-export, a helper imported under a
 * harmless name. Every function here reads the TypeScript AST instead, so a
 * binding is followed to where it came from and a call is judged by what it
 * calls, however it is written.
 *
 * Pure over source text, so verifiers can run the real functions against
 * mutants without touching files.
 */
import ts from "typescript";

export type ModuleEdge = {
  module: string;
  kind: "import" | "side-effect" | "re-export" | "dynamic-import" | "require";
  typeOnly: boolean;
  /** For imports: the EXPORTED name of each binding (never the local alias), with its local name. */
  names: { exported: string; local: string; typeOnly: boolean }[];
  line: number;
};

export function parse(source: string, fileName = "file.tsx"): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.TSX);
}
const line = (sf: ts.SourceFile, n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

/** Every way this file reaches another module. */
export function moduleEdges(sf: ts.SourceFile): ModuleEdge[] {
  const out: ModuleEdge[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const mod = n.moduleSpecifier.text;
      const c = n.importClause;
      if (!c) { out.push({ module: mod, kind: "side-effect", typeOnly: false, names: [], line: line(sf, n) }); }
      else {
        const names: ModuleEdge["names"] = [];
        if (c.name) names.push({ exported: "default", local: c.name.text, typeOnly: c.isTypeOnly });
        if (c.namedBindings) {
          if (ts.isNamespaceImport(c.namedBindings)) names.push({ exported: "*namespace*", local: c.namedBindings.name.text, typeOnly: c.isTypeOnly });
          else for (const el of c.namedBindings.elements) names.push({ exported: (el.propertyName ?? el.name).text, local: el.name.text, typeOnly: c.isTypeOnly || el.isTypeOnly });
        }
        out.push({ module: mod, kind: "import", typeOnly: c.isTypeOnly, names, line: line(sf, n) });
      }
    }
    if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      out.push({ module: n.moduleSpecifier.text, kind: "re-export", typeOnly: n.isTypeOnly, names: [], line: line(sf, n) });
    }
    if (ts.isCallExpression(n)) {
      if (n.expression.kind === ts.SyntaxKind.ImportKeyword) out.push({ module: n.arguments[0] && ts.isStringLiteral(n.arguments[0]) ? n.arguments[0].text : "<dynamic>", kind: "dynamic-import", typeOnly: false, names: [], line: line(sf, n) });
      if (ts.isIdentifier(n.expression) && n.expression.text === "require") out.push({ module: n.arguments[0] && ts.isStringLiteral(n.arguments[0]) ? n.arguments[0].text : "<dynamic>", kind: "require", typeOnly: false, names: [], line: line(sf, n) });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

export type Policy = Record<string, readonly string[]>;

/** Everything this file reaches that the policy does not permit. Type-only edges cannot run and are exempt. */
export function importViolations(source: string, policy: Policy, fileName = "file.tsx"): string[] {
  const out: string[] = [];
  for (const e of moduleEdges(parse(source, fileName))) {
    if (e.typeOnly) continue;
    if (e.kind !== "import") { out.push(`${e.module}:${e.kind}`); continue; }
    const allowed = policy[e.module];
    if (!allowed) { out.push(`${e.module}:*`); continue; }
    for (const n of e.names) if (!n.typeOnly && !allowed.includes(n.exported)) out.push(`${e.module}:${n.exported}`);
  }
  return out;
}

/** Local names bound to an export of `module` (default, named, aliased). */
function localsFrom(sf: ts.SourceFile, module: string, exported?: string): Set<string> {
  const s = new Set<string>();
  for (const e of moduleEdges(sf)) if (e.kind === "import" && e.module === module) for (const n of e.names) if (!exported || n.exported === exported) s.add(n.local);
  return s;
}

export type RequestAccess = { kind: "params-prop" | "searchParams-prop" | "next-headers-import" | "next-server-import" | "headers-call" | "cookies-call" | "request-arg" | "arguments-object"; detail: string; line: number };

/**
 * Every way a file can read something from the incoming request: a page or
 * layout prop named `params`/`searchParams` (destructured or dotted, under
 * any local name), a binding from next/headers called (under any alias),
 * next/headers or next/server imported at all, or a route handler's request
 * argument being used.
 */
export function requestAccess(source: string, fileName = "file.tsx"): RequestAccess[] {
  const sf = parse(source, fileName);
  const out: RequestAccess[] = [];
  for (const e of moduleEdges(sf)) {
    if (e.module === "next/headers" && !e.typeOnly) out.push({ kind: "next-headers-import", detail: e.names.map((n) => `${n.exported} as ${n.local}`).join(",") || e.kind, line: e.line });
    if (e.module === "next/server" && !e.typeOnly) out.push({ kind: "next-server-import", detail: e.names.map((n) => n.exported).join(","), line: e.line });
  }
  const headerLocals = localsFrom(sf, "next/headers", "headers"), cookieLocals = localsFrom(sf, "next/headers", "cookies");
  const REQ_PROPS = new Set(["params", "searchParams"]);
  const propKind = (m: string): RequestAccess["kind"] => m === "searchParams" ? "searchParams-prop" : "params-prop";
  const visit = (n: ts.Node) => {
    if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n)) {
      // EVERY parameter, not only the first: a route handler receives its
      // route context — `{ params }` — as the SECOND argument.
      n.parameters.forEach((param, index) => {
        if (ts.isObjectBindingPattern(param.name)) {
          for (const el of param.name.elements) {
            const key = bindingKey(el);
            if (key === "<rest>") out.push({ kind: "params-prop", detail: `rest of argument ${index}: ${el.getText(sf)}`, line: line(sf, el) });
            else if (REQ_PROPS.has(key) || key === "<computed>") out.push({ kind: propKind(key), detail: el.getText(sf), line: line(sf, el) });
          }
        }
        if (ts.isIdentifier(param.name) && n.body) {
          const name = param.name.text;
          const t = param.type?.getText(sf) ?? "";
          if (/\b(Request|NextRequest)\b/.test(t)) {
            const uses = (m: ts.Node): boolean => (ts.isIdentifier(m) && m.text === name && m !== param.name) || ts.forEachChild(m, uses) === true;
            if (uses(n.body)) out.push({ kind: "request-arg", detail: `${name} is read`, line: line(sf, param) });
          } else {
            // Uses of this argument, aliases (including `as any`) followed. Member,
            // destructure and computed reads of params/searchParams count for any
            // argument; an argument escaping whole counts for the props argument
            // (index 0) or any argument whose type names params/searchParams.
            const isPropsLike = index === 0 || /\b(params|searchParams)\b/.test(t);
            for (const u of bindingUses(sf, name)) {
              if ((u.kind === "member" || u.kind === "destructure") && (REQ_PROPS.has(u.member) || u.member === "<computed>" || u.member === "<rest>")) out.push({ kind: propKind(u.member), detail: u.text, line: u.line });
              else if (isPropsLike && (u.kind === "spread" || u.kind === "return" || u.kind === "arg-of")) out.push({ kind: "params-prop", detail: `argument escapes: ${u.text}`, line: u.line });
            }
          }
        }
      });
    }
    // The implicit `arguments` object reaches every argument a framework passed,
    // declared or not. On a platform surface it is refused outright.
    if (ts.isIdentifier(n) && n.text === "arguments" && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)) out.push({ kind: "arguments-object", detail: n.parent.getText(sf).slice(0, 60), line: line(sf, n) });
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      if (headerLocals.has(n.expression.text)) out.push({ kind: "headers-call", detail: n.getText(sf), line: line(sf, n) });
      if (cookieLocals.has(n.expression.text)) out.push({ kind: "cookies-call", detail: n.getText(sf), line: line(sf, n) });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const MUTATORS = new Set(["create", "update", "upsert", "delete", "createMany", "updateMany", "deleteMany", "$executeRaw", "$executeRawUnsafe", "$queryRaw", "$queryRawUnsafe", "$transaction"]);

/**
 * The member a property or element access names: `x.delete` -> "delete",
 * `x["delete"]` -> "delete", `x[method]` -> "<computed>" (unknowable, and on a
 * read-only surface unknowable is refused).
 */
function memberName(e: ts.Expression): string | null {
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  if (ts.isElementAccessExpression(e)) {
    const a = e.argumentExpression;
    if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) return a.text;
    return "<computed>";
  }
  return null;
}

/** Climb out of expressions that change nothing at runtime: `(x)`, `x as T`, `x satisfies T`, `x!`, `<T>x`. */
function transparentParent(n: ts.Node): ts.Node {
  let cur = n;
  while (cur.parent && (ts.isParenthesizedExpression(cur.parent) || ts.isAsExpression(cur.parent) || ts.isSatisfiesExpression(cur.parent) || ts.isNonNullExpression(cur.parent) || ts.isTypeAssertionExpression(cur.parent))) cur = cur.parent;
  return cur;
}
function unwrapExpr(e: ts.Expression): ts.Expression {
  let cur = e;
  while (ts.isParenthesizedExpression(cur) || ts.isAsExpression(cur) || ts.isSatisfiesExpression(cur) || ts.isNonNullExpression(cur) || ts.isTypeAssertionExpression(cur)) cur = cur.expression;
  return cur;
}
/** The key a binding element reads: `{ x }`, `{ x: y }`, `{ "x": y }`, `{ ["x"]: y }` -> "x"; `{ [k]: y }` -> "<computed>"; `{ ...r }` -> "<rest>". */
export function bindingKey(el: ts.BindingElement): string {
  if (el.dotDotDotToken) return "<rest>";
  const k = el.propertyName ?? el.name;
  if (ts.isIdentifier(k)) return k.text;
  if (ts.isStringLiteral(k) || ts.isNumericLiteral(k)) return k.text;
  if (ts.isComputedPropertyName(k)) { const e = unwrapExpr(k.expression); return ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) ? e.text : "<computed>"; }
  return "<computed>";
}

/** Keys of an object-pattern ASSIGNMENT target: `({ delete: write } = x)` -> ["delete"]; `({ [k]: w } = x)` -> ["<computed>"]; `({ ...r } = x)` -> ["<rest>"]. */
function assignmentPatternKeys(obj: ts.ObjectLiteralExpression): string[] {
  return obj.properties.map((pr) => {
    if (ts.isSpreadAssignment(pr)) return "<rest>";
    if (ts.isShorthandPropertyAssignment(pr)) return pr.name.text;
    if (ts.isPropertyAssignment(pr)) {
      const k = pr.name;
      if (ts.isIdentifier(k) || ts.isStringLiteral(k) || ts.isNumericLiteral(k)) return k.text;
      if (ts.isComputedPropertyName(k)) { const e = unwrapExpr(k.expression); return ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) ? e.text : "<computed>"; }
    }
    return "<computed>";
  });
}

export type BindingUse =
  | { kind: "member"; member: string; text: string; line: number }        // p.x, p["x"], p[k] (member "<computed>")
  | { kind: "destructure"; member: string; text: string; line: number }   // const { x } = p   (one per key; rest -> "<rest>")
  | { kind: "arg-of"; callee: string; index: number; text: string; line: number }
  | { kind: "alias"; alias: string; text: string; line: number }          // const q = p; q = p
  | { kind: "spread" | "return" | "other"; text: string; line: number };

/**
 * Every value-use of a binding, following its aliases.
 *
 * `const p = prisma; p.service.findMany()` is a use of `prisma`, and so is
 * `const { service } = prisma`, `fn(prisma)`, `{ ...prisma }`, and
 * `return prisma`. The alias set is closed flow-insensitively over the whole
 * file (an alias of an alias is an alias), which over-approximates — on a
 * read-only surface an over-approximation refuses, never admits.
 */
export function bindingUses(sf: ts.SourceFile, root: string): BindingUse[] {
  const aliases = new Set([root]);
  // close the alias set: any `const q = <alias>` or `q = <alias>` adds q
  let grew = true;
  while (grew) {
    grew = false;
    const scan = (n: ts.Node) => {
      if (ts.isVariableDeclaration(n) && n.initializer) { const init = unwrapExpr(n.initializer); if (ts.isIdentifier(init) && aliases.has(init.text) && ts.isIdentifier(n.name) && !aliases.has(n.name.text)) { aliases.add(n.name.text); grew = true; } }
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) { const r = unwrapExpr(n.right); if (ts.isIdentifier(r) && aliases.has(r.text) && ts.isIdentifier(n.left) && !aliases.has(n.left.text)) { aliases.add(n.left.text); grew = true; } }
      ts.forEachChild(n, scan);
    };
    scan(sf);
  }
  const out: BindingUse[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isIdentifier(n) && aliases.has(n.text)) {
      const parent = n.parent;
      const isDecl = (ts.isVariableDeclaration(parent) && parent.name === n) || (ts.isParameter(parent) && parent.name === n) || ts.isBindingElement(parent) || (ts.isPropertyAccessExpression(parent) && parent.name === n) || ts.isImportSpecifier(parent) || ts.isImportClause(parent) || (ts.isPropertyAssignment(parent) && parent.name === n) || (ts.isShorthandPropertyAssignment(parent) && false);
      if (!isDecl) {
        // Look through `(x)`, `x as T`, `x!`, `<T>x`: they change nothing at runtime.
        const eff = transparentParent(n); const parent2 = eff.parent; const self = eff as ts.Expression;
        if ((ts.isPropertyAccessExpression(parent2) || ts.isElementAccessExpression(parent2)) && parent2.expression === self) out.push({ kind: "member", member: memberName(parent2) ?? "<unknown>", text: parent2.getText(sf), line: line(sf, n) });
        else if (ts.isVariableDeclaration(parent2) && parent2.initializer === self) {
          if (ts.isObjectBindingPattern(parent2.name)) for (const el of parent2.name.elements) out.push({ kind: "destructure", member: bindingKey(el), text: parent2.getText(sf), line: line(sf, n) });
          else out.push({ kind: "alias", alias: parent2.name.getText(sf), text: parent2.getText(sf), line: line(sf, n) });
        }
        else if (ts.isBinaryExpression(parent2) && parent2.right === self && parent2.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
          if (ts.isObjectLiteralExpression(parent2.left)) for (const k of assignmentPatternKeys(parent2.left)) out.push({ kind: "destructure", member: k, text: parent2.getText(sf), line: line(sf, n) });
          else out.push({ kind: "alias", alias: parent2.left.getText(sf), text: parent2.getText(sf), line: line(sf, n) });
        }
        else if (ts.isCallExpression(parent2) && parent2.arguments.includes(self)) out.push({ kind: "arg-of", callee: parent2.expression.getText(sf), index: parent2.arguments.indexOf(self), text: parent2.getText(sf).slice(0, 80), line: line(sf, n) });
        else if (ts.isSpreadElement(parent2) || ts.isSpreadAssignment(parent2)) out.push({ kind: "spread", text: parent2.parent.getText(sf).slice(0, 80), line: line(sf, n) });
        else if (ts.isReturnStatement(parent2) || ts.isArrowFunction(parent2)) out.push({ kind: "return", text: parent2.getText(sf).slice(0, 80), line: line(sf, n) });
        else if (ts.isShorthandPropertyAssignment(parent2)) out.push({ kind: "other", text: `shorthand property ${n.text}`, line: line(sf, n) });
        else out.push({ kind: "other", text: parent2.getText(sf).slice(0, 80), line: line(sf, n) });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/**
 * Every mutating Prisma operation, however it is reached: a call whose callee
 * names a mutator by dot or by bracket (`guarded.service["delete"](…)`,
 * `prisma["contractor"]["update"](…)`); a computed member call whose name
 * cannot be known; a tagged raw statement (`db.$executeRaw\`DELETE …\``); a
 * mutator EXTRACTED as a value (`const write = db.service.delete`) or
 * destructured out (`const { update } = db.service`) — reported at the
 * extraction, since what happens to it afterwards cannot be bounded.
 */
export function mutatingCalls(source: string, fileName = "file.tsx"): { callee: string; line: number }[] {
  const sf = parse(source, fileName); const out: { callee: string; line: number }[] = [];
  const isMut = (m: string | null) => m !== null && (MUTATORS.has(m) || m === "<computed>");
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && isMut(memberName(n.expression))) out.push({ callee: n.expression.getText(sf), line: line(sf, n) });
    else if (ts.isTaggedTemplateExpression(n) && isMut(memberName(n.tag))) out.push({ callee: n.tag.getText(sf) + "`…`", line: line(sf, n) });
    // In VALUE position only a literally named mutator counts: `results[i]` is
    // array indexing, not a Prisma member, and cannot be told apart from one
    // without types. A computed member is still refused wherever it is CALLED.
    else if ((ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) && MUTATORS.has(memberName(n) ?? "")
      && !(ts.isCallExpression(n.parent) && n.parent.expression === n) && !(ts.isTaggedTemplateExpression(n.parent) && n.parent.tag === n)) out.push({ callee: `${n.getText(sf)} (extracted)`, line: line(sf, n) });
    if (ts.isVariableDeclaration(n) && ts.isObjectBindingPattern(n.name)) {
      for (const el of n.name.elements) {
        const k = bindingKey(el); // `{ ["delete"]: write }` normalizes to "delete"; `{ [k]: w }` is unknowable
        if (MUTATORS.has(k) || k === "<computed>" || k === "<rest>") out.push({ callee: `{ ${k} } destructured from ${n.initializer?.getText(sf) ?? "?"}`, line: line(sf, el) });
      }
    }
    // `({ delete: write } = db.service)` — the same destructure, written as an assignment.
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isObjectLiteralExpression(n.left)) {
      for (const k of assignmentPatternKeys(n.left)) if (MUTATORS.has(k) || k === "<computed>" || k === "<rest>") out.push({ callee: `{ ${k} } assigned from ${n.right.getText(sf)}`, line: line(sf, n) });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf); return out;
}

/**
 * Member accesses reached from a binding, FOLLOWING ALIASES and destructures:
 * `prisma.service`, `prisma["service"]`, `prisma[x]` ("<computed>"),
 * `const p = prisma; p.service`, `const { service } = prisma`.
 */
export function memberAccessesOn(source: string, identifier: string, fileName = "file.ts"): { member: string; line: number }[] {
  const sf = parse(source, fileName);
  return bindingUses(sf, identifier).flatMap((u) => u.kind === "member" || u.kind === "destructure" ? [{ member: u.member, line: u.line }] : []);
}

/** Every value-use of a binding in a file, aliases followed. For rules of the form "this client may only be passed to X". */
export function usesOf(source: string, identifier: string, fileName = "file.ts"): BindingUse[] {
  return bindingUses(parse(source, fileName), identifier);
}

export type ParamsUse = { kind: "boundary-arg" | "other"; text: string; line: number };

/**
 * Every value-use of the page's `params` binding, and what each one is.
 *
 * The Control Center may take the contractor id from the request in exactly
 * one way: the expression `params.contractorId`, written by dot, as the
 * direct first argument of `platformContractor(...)`. Anything else that
 * touches `params` — a copy before or after, a bracket access, a
 * destructure, a spread, passing `params` itself, a second read — is a use
 * the rule does not permit, and is reported here so the verifier can refuse
 * it. The binding is found from the default export's parameter list under
 * whatever local name it was given.
 */
export function paramsUses(source: string, boundary = "platformContractor", fileName = "file.tsx"): { local: string | null; uses: ParamsUse[]; boundaryCalls: number } {
  const sf = parse(source, fileName);
  let local: string | null = null; let fn: ts.FunctionLikeDeclaration | null = null;
  const findFn = (n: ts.Node) => {
    if (fn) return;
    if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)) && n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) && n.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) fn = n;
    ts.forEachChild(n, findFn);
  };
  findFn(sf);
  const f = fn as ts.FunctionLikeDeclaration | null;
  if (f && f.parameters[0]) {
    const p0 = f.parameters[0];
    if (ts.isObjectBindingPattern(p0.name)) {
      for (const el of p0.name.elements) {
        const key = el.propertyName ?? el.name;
        if (ts.isIdentifier(key) && key.text === "params") local = ts.isIdentifier(el.name) ? el.name.text : "<destructured>";
      }
    } else if (ts.isIdentifier(p0.name)) {
      local = `${p0.name.text}.params`;
    }
  }
  const uses: ParamsUse[] = []; let boundaryCalls = 0;
  if (!f || !f.body) return { local, uses, boundaryCalls };
  const isBoundaryCall = (n: ts.Node) => ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === boundary;
  const visit = (n: ts.Node) => {
    if (isBoundaryCall(n)) boundaryCalls++;
    // a reference to the local binding (not its declaration)
    if (local && !local.includes(".") && local !== "<destructured>" && ts.isIdentifier(n) && n.text === local && !ts.isBindingElement(n.parent) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)) {
      const parent = n.parent;
      const isDotContractorId = ts.isPropertyAccessExpression(parent) && parent.expression === n && parent.name.text === "contractorId";
      const call = parent.parent;
      if (isDotContractorId && call && isBoundaryCall(call) && (call as ts.CallExpression).arguments[0] === parent) uses.push({ kind: "boundary-arg", text: parent.getText(sf), line: line(sf, n) });
      else uses.push({ kind: "other", text: (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent) ? parent : n).getText(sf), line: line(sf, n) });
    }
    if (local === "<destructured>") uses.push({ kind: "other", text: "params is destructured in the parameter list", line: line(sf, f.parameters[0]) });
    if (local && local.includes(".") && ts.isPropertyAccessExpression(n) && n.getText(sf) === local) uses.push({ kind: "other", text: n.parent.getText(sf), line: line(sf, n) });
    ts.forEachChild(n, visit);
  };
  visit(f.body);
  if (local === "<destructured>") uses.splice(1);
  return { local, uses, boundaryCalls };
}

/** Calls to `callee` with the text of each argument. */
export function callsTo(source: string, callee: string, fileName = "file.tsx"): { args: string[]; line: number }[] {
  const sf = parse(source, fileName); const out: { args: string[]; line: number }[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === callee) out.push({ args: n.arguments.map((a) => a.getText(sf)), line: line(sf, n) });
    ts.forEachChild(n, visit);
  };
  visit(sf); return out;
}

/** Relation fields per model, from prisma/schema.prisma text: model -> { field -> targetModel }. Pure over text. */
export function prismaRelations(schema: string): Record<string, Record<string, string>> {
  const models = new Set([...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]));
  const out: Record<string, Record<string, string>> = {};
  for (const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const fields: Record<string, string> = {};
    for (const ln of m[2].split("\n")) {
      const f = ln.match(/^\s+(\w+)\s+(\w+)(\[\]|\?)?(\s|$)/);
      if (f && models.has(f[2])) fields[f[1]] = f[2];
    }
    out[m[1]] = fields;
  }
  return out;
}

const lc = (m: string) => m[0].toLowerCase() + m.slice(1);
const uc = (m: string) => m[0].toUpperCase() + m.slice(1);

/**
 * Every relation a query on `root.<model>.<op>({…})` reaches, at any depth
 * and under any wrapper (include, select, where, orderBy, _count, some /
 * every / none …), as "Model.field -> Target". A directory read on a platform
 * model that includes, selects, counts or filters by a tenant-owned relation
 * is a cross-tenant read without the guard, and this is how it is found.
 */
/** A value that cannot hide a query shape: string/number/boolean/null/undefined literals. */
function isPlainLiteral(n: ts.Node): boolean {
  return ts.isStringLiteralLike(n) || ts.isNumericLiteral(n) || n.kind === ts.SyntaxKind.TrueKeyword || n.kind === ts.SyntaxKind.FalseKeyword || n.kind === ts.SyntaxKind.NullKeyword
    || (ts.isIdentifier(n) && n.text === "undefined") || (ts.isPrefixUnaryExpression(n) && ts.isNumericLiteral(n.operand));
}

/** Whether a binding name — identifier, object pattern or array pattern, at any depth — introduces `name`. */
function bindsName(b: ts.BindingName, name: string): boolean {
  if (ts.isIdentifier(b)) return b.text === name;
  for (const el of b.elements) if (ts.isBindingElement(el) && bindsName(el.name, name)) return true;
  return false;
}

export function relationTraversals(source: string, root: string, relations: Record<string, Record<string, string>>, fileName = "file.ts"): { path: string; target: string; line: number }[] {
  const sf = parse(source, fileName); const out: { path: string; target: string; line: number }[] = [];
  // Module-scope `const X = { … }` object literals are resolved, so a shared
  // select such as SITES_SELECT is walked rather than treated as opaque.
  const consts = new Map<string, ts.Expression>();
  for (const st of sf.statements) if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) consts.set(d.name.text, unwrapExpr(d.initializer));
  const resolve = (e: ts.Expression): ts.Expression => { let cur = unwrapExpr(e); for (let i = 0; i < 8 && ts.isIdentifier(cur) && consts.has(cur.text); i++) cur = unwrapExpr(consts.get(cur.text)!); return cur; };
  // Query keys under which an opaque value would hide a relation walk.
  const WRAPPERS = new Set(["include", "select", "where", "orderBy", "_count", "some", "every", "none", "is", "isNot", "data", "AND", "OR", "NOT"]);
  const walk = (raw: ts.Node, model: string, path: string, keyIsShape: boolean) => {
    const node = ts.isExpression(raw) ? resolve(raw) : raw;
    if (ts.isObjectLiteralExpression(node)) {
      for (const pr of node.properties) {
        if (ts.isSpreadAssignment(pr)) { const sp = resolve(pr.expression); if (ts.isObjectLiteralExpression(sp)) walk(sp, model, `${path}.<spread>`, keyIsShape); else out.push({ path: `${path}.<spread ${pr.expression.getText(sf).slice(0, 20)}>`, target: "<unknown>", line: line(sf, pr) }); continue; }
        const name = ts.isPropertyAssignment(pr) || ts.isShorthandPropertyAssignment(pr) ? (ts.isComputedPropertyName(pr.name) ? "<computed>" : (pr.name as ts.Identifier | ts.StringLiteral).text) : "<other>";
        const target = relations[model]?.[name];
        if (target) { out.push({ path: `${path}.${name}`, target, line: line(sf, pr) }); if (ts.isPropertyAssignment(pr)) walk(pr.initializer, target, `${path}.${name}`, true); }
        else if (name === "<computed>") out.push({ path: `${path}.<computed>`, target: "<unknown>", line: line(sf, pr) });
        else if (ts.isPropertyAssignment(pr)) walk(pr.initializer, model, `${path}.${name}`, WRAPPERS.has(name));
      }
    } else if (ts.isArrayLiteralExpression(node)) node.elements.forEach((e) => walk(e, model, path, keyIsShape));
    // An opaque value matters only where a shape could hide a relation: under a
    // wrapper key or as a relation's own argument. `contractorId: { in: rows.map(…) }`
    // is a scalar filter and cannot reach another model.
    else if (keyIsShape && !isPlainLiteral(node)) out.push({ path: `${path}=<opaque ${node.getText(sf).slice(0, 30)}>`, target: "<unknown>", line: line(sf, node) });
  };
  // `root.model.method(arg)` in any spelling: dot or bracket for either hop,
  // casts and parentheses between. A computed model or method is unknowable
  // and reported as a traversal to nowhere, which the caller refuses.
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const callee = unwrapExpr(n.expression);
      const method = memberName(callee);
      if (method !== null && (ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee))) {
        const recv = unwrapExpr(callee.expression);
        const modelName = memberName(recv);
        if (modelName !== null && (ts.isPropertyAccessExpression(recv) || ts.isElementAccessExpression(recv))) {
          const base = unwrapExpr(recv.expression);
          if (ts.isIdentifier(base) && base.text === root) {
            if (modelName === "<computed>" || method === "<computed>") out.push({ path: `${root}.${modelName}.${method}`, target: "<unknown>", line: line(sf, n) });
            else { const model = uc(modelName); for (const a of n.arguments) walk(a, model, `${root}.${lc(model)}`, true); }
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf); return out;
}

/**
 * Whether a call's callee is the GENUINE binding the caller thinks it is: an
 * import of the named export from the named module, or a module-scope
 * declaration of that name — and NOT shadowed by any declaration in a scope
 * between the call and the module. A local `const listContractors = …` inside
 * a function makes `listContractors(x)` a different function.
 */
export function calleeResolution(sf: ts.SourceFile, call: ts.CallExpression): { name: string; kind: "import" | "module-decl" | "shadowed" | "local" | "unknown"; module?: string; exported?: string; shadowedBy?: string } {
  if (!ts.isIdentifier(call.expression)) return { name: call.expression.getText(sf), kind: "unknown" };
  const name = call.expression.text;
  // Does any scope between the call and the module declare `name`? Each
  // enclosing function-like or block is searched for its OWN declarations,
  // never descending into nested functions, which are their own scopes.
  const declaredIn = (container: ts.Node): string | null => {
    let found: string | null = null;
    const look = (m: ts.Node) => {
      if (found) return;
      if (m !== container && ts.isFunctionLike(m)) return;
      // Any way a scope can introduce the name: a declaration by identifier or
      // by object/array pattern, a function or class declaration, or a catch
      // clause's binding.
      if ((ts.isVariableDeclaration(m) && bindsName(m.name, name)) || (ts.isFunctionDeclaration(m) && m.name?.text === name) || (ts.isClassDeclaration(m) && m.name?.text === name) || (ts.isCatchClause(m) && m.variableDeclaration && bindsName(m.variableDeclaration.name, name))) { found = m.getText(sf).slice(0, 70); return; }
      ts.forEachChild(m, look);
    };
    if (ts.isFunctionLike(container)) {
      for (const prm of container.parameters) if (bindsName(prm.name, name)) return `parameter ${prm.getText(sf).slice(0, 70)}`;
      const body = (container as ts.FunctionLikeDeclaration).body;
      if (body) look(body);
    } else look(container);
    return found;
  };
  let scope: ts.Node | undefined = call.parent;
  while (scope && scope !== sf) {
    if (ts.isBlock(scope) || ts.isFunctionLike(scope)) { const hit = declaredIn(scope); if (hit) return { name, kind: "shadowed", shadowedBy: hit }; }
    scope = scope.parent;
  }
  // module scope: an import, or a top-level declaration
  for (const e of moduleEdges(sf)) if (e.kind === "import") for (const b of e.names) if (b.local === name) return { name, kind: "import", module: e.module, exported: b.exported };
  // A module-scope declaration counts only when it is the ONE declaration of
  // the name (a function, class, or a plain `const name = …`); a pattern
  // binding or a second declaration of the same name is not the genuine sink.
  const decls: string[] = [];
  for (const st of sf.statements) {
    if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name?.text === name) decls.push("plain");
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (bindsName(d.name, name)) decls.push(ts.isIdentifier(d.name) ? "plain" : "pattern");
  }
  if (decls.length === 1 && decls[0] === "plain") return { name, kind: "module-decl" };
  if (decls.length > 0) return { name, kind: "unknown", shadowedBy: decls.length > 1 ? `${decls.length} module-scope declarations` : "module-scope pattern binding" };
  return { name, kind: "unknown" };
}

/** Every call in the file whose callee identifier is `name`, with how it resolves. */
export function callsResolved(source: string, name: string, fileName = "file.ts"): ReturnType<typeof calleeResolution>[] {
  const sf = parse(source, fileName); const out: ReturnType<typeof calleeResolution>[] = [];
  const visit = (n: ts.Node) => { if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name) out.push(calleeResolution(sf, n)); ts.forEachChild(n, visit); };
  visit(sf); return out;
}
