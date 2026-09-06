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

export type RequestAccess = { kind: "params-prop" | "searchParams-prop" | "next-headers-import" | "next-server-import" | "headers-call" | "cookies-call" | "request-arg"; detail: string; line: number };

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
  const visit = (n: ts.Node) => {
    // { params } / { searchParams } / { params: p } / { params: { contractorId } } in any parameter list
    if (ts.isParameter(n) && ts.isObjectBindingPattern(n.name)) {
      for (const el of n.name.elements) {
        const key = (el.propertyName ?? el.name); const keyText = ts.isIdentifier(key) ? key.text : key.getText(sf);
        if (keyText === "params") out.push({ kind: "params-prop", detail: el.getText(sf), line: line(sf, el) });
        if (keyText === "searchParams") out.push({ kind: "searchParams-prop", detail: el.getText(sf), line: line(sf, el) });
      }
    }
    // props.params / props.searchParams on a plain parameter
    if (ts.isPropertyAccessExpression(n) && (n.name.text === "params" || n.name.text === "searchParams") && ts.isIdentifier(n.expression)) {
      out.push({ kind: n.name.text === "params" ? "params-prop" : "searchParams-prop", detail: n.getText(sf), line: line(sf, n) });
    }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      if (headerLocals.has(n.expression.text)) out.push({ kind: "headers-call", detail: n.getText(sf), line: line(sf, n) });
      if (cookieLocals.has(n.expression.text)) out.push({ kind: "cookies-call", detail: n.getText(sf), line: line(sf, n) });
    }
    // a route handler's request parameter used anywhere: (req: Request) => ... req.x
    if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n)) && n.parameters.length > 0) {
      const first = n.parameters[0];
      const t = first.type?.getText(sf) ?? "";
      if (ts.isIdentifier(first.name) && /\b(Request|NextRequest)\b/.test(t)) {
        const name = first.name.text;
        const uses = (m: ts.Node): boolean => (ts.isIdentifier(m) && m.text === name && m !== first.name) || ts.forEachChild(m, uses) === true;
        if (n.body && uses(n.body)) out.push({ kind: "request-arg", detail: `${name} is read`, line: line(sf, first) });
      }
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

/**
 * Every mutating Prisma operation, however it is reached: a call whose callee
 * names a mutator by dot or by bracket (`guarded.service["delete"](…)`,
 * `prisma["contractor"]["update"](…)`), a computed member call whose name
 * cannot be known, and a tagged raw statement (`db.$executeRaw\`DELETE …\``).
 */
export function mutatingCalls(source: string, fileName = "file.tsx"): { callee: string; line: number }[] {
  const sf = parse(source, fileName); const out: { callee: string; line: number }[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const m = memberName(n.expression);
      if (m !== null && (MUTATORS.has(m) || m === "<computed>")) out.push({ callee: n.expression.getText(sf), line: line(sf, n) });
    }
    if (ts.isTaggedTemplateExpression(n)) {
      const m = memberName(n.tag);
      if (m !== null && (MUTATORS.has(m) || m === "<computed>")) out.push({ callee: n.tag.getText(sf) + "`…`", line: line(sf, n) });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf); return out;
}

/** Member accesses on a given identifier by dot or bracket: `prisma.service`, `prisma["service"]`, `prisma[x]` (reported as <computed>). */
export function memberAccessesOn(source: string, identifier: string, fileName = "file.ts"): { member: string; line: number }[] {
  const sf = parse(source, fileName); const out: { member: string; line: number }[] = [];
  const visit = (n: ts.Node) => {
    if ((ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) && ts.isIdentifier(n.expression) && n.expression.text === identifier) {
      out.push({ member: memberName(n) ?? "<unknown>", line: line(sf, n) });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf); return out;
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
