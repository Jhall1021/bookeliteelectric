"""
The mutations the sweep applies, one per guard.

Kept as data rather than in an operator's shell history: a mutation result
nobody can reproduce is an anecdote. `scripts/mutation-sweep.sh` lists these,
applies them one at a time, and restores the tree between each.

Each entry names the guard it removes. If a mutation stops applying, that is a
signal in itself — the code it was written against has moved, and whether the
guard survived the move is worth knowing.
"""
import pathlib, sys

R = "scripts/release-production.ts"
C = "scripts/_releaseControl.ts"
P = "scripts/_releaseProvenance.ts"
N = "scripts/_releaseRun.ts"
I = "app/api/deployment-identity/route.ts"

# Which suite is supposed to catch a mutation. A mutation checked against a
# suite that never looks at the code it changed reports NOT DETECTED and means
# nothing, so the pairing is data too.
CONTROL = "scripts/verify-release-control.ts"
PROVENANCE = "scripts/verify-release-provenance.ts"
DEFAULT_SUITE = CONTROL


def _sub(path, old, new):
    def go():
        p = pathlib.Path(path)
        s = p.read_text()
        if old not in s:
            raise SystemExit(f"pattern not found in {path}")
        p.write_text(s.replace(old, new, 1))
    return go


def _insert_before(path, needle, text, then=None):
    """Put `text` immediately before `needle` — for mutations that ADD a leak
    rather than remove a check. `then` applies one further (old, new) rewrite."""
    def go():
        p = pathlib.Path(path)
        s = p.read_text()
        if s.count(needle) != 1:
            raise SystemExit(f"anchor is not unique in {path}")
        s = s.replace(needle, text + needle, 1)
        if then:
            old, new = then
            if s.count(old) != 1:
                raise SystemExit(f"second anchor is not unique in {path}")
            s = s.replace(old, new, 1)
        p.write_text(s)
    return go


def _cut(path, start, end):
    def go():
        p = pathlib.Path(path)
        s = p.read_text()
        i, j = s.index(start), s.index(end)
        p.write_text(s[:i] + s[j:])
    return go


# The identity route's PAYLOAD call — not the 404 branch above it, which returns
# no facts and is not what the allowlist governs.
PAYLOAD_CALL = "  return NextResponse.json({\n    deployment: {"


def _leak(decl, key):
    """Add a secret to the identity payload the way a careless edit would: a
    shorthand property or a spread, either of which a text search for
    `process.env.X` inside the object literal would miss."""
    return _insert_before(
        I, PAYLOAD_CALL,
        "  " + decl + "\n",
        then=(PAYLOAD_CALL, "  return NextResponse.json({\n    " + key + "\n    deployment: {"),
    )


def _indirect_payload():
    """Hand the payload to NextResponse.json as a VARIABLE. Must stay valid
    TypeScript: a syntax error is a broken harness, not a caught mutation."""
    def go():
        p = pathlib.Path(I)
        t = p.read_text()
        tail = "    },\n  });\n}\n"
        if t.count(PAYLOAD_CALL) != 1 or not t.endswith(tail):
            raise SystemExit(f"payload shape changed in {I}")
        t = t.replace(PAYLOAD_CALL, "  const body = {\n    deployment: {", 1)
        t = t[: -len(tail)] + "    },\n  };\n  return NextResponse.json(body);\n}\n"
        p.write_text(t)
    return go


def _aliased_response():
    """Return a response through an ALIAS, so the NextResponse.json count is
    unchanged and only the return-path check can notice."""
    def go():
        p = pathlib.Path(I)
        t = p.read_text()
        needle = "  const expected = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;"
        if t.count(needle) != 1:
            raise SystemExit(f"handler shape changed in {I}")
        t = t.replace(needle, needle + '\n  const R = NextResponse;\n'
                      '  if (process.env.DEBUG_IDENTITY) return R.json({ leak: process.env.VERCEL_TOKEN });', 1)
        p.write_text(t)
    return go


def _parenthesized_alias():
    """`key: (key)` — an allow-listed NAME whose value is a wrapper. The old
    walker traced only bare identifiers, so a single pair of parentheses put the
    value beyond every check while the payload text stayed spotless."""
    def go():
        p = pathlib.Path(I)
        t = p.read_text()
        if t.count(PAYLOAD_CALL) != 1:
            raise SystemExit(f"payload call shape changed in {I}")
        t = t.replace(PAYLOAD_CALL,
                      '  const key = process.env.VERCEL_TOKEN ?? "";\n'
                      "  return NextResponse.json({\n"
                      "    key: (key),\n"
                      "    deployment: {", 1)
        p.write_text(t)
    return go


def _leak_through_headers():
    """The payload stays clean and the secret rides out in a response header,
    which lived entirely outside anything the check looked at."""
    def go():
        p = pathlib.Path(I)
        t = p.read_text()
        tail = "    },\n  });\n}\n"
        if not t.endswith(tail):
            raise SystemExit(f"payload tail changed in {I}")
        t = t[: -len(tail)] + ("    },\n  }, {\n"
                               '    headers: { "x-debug-token": process.env.VERCEL_TOKEN ?? "" },\n'
                               "  });\n}\n")
        p.write_text(t)
    return go


MUTATIONS = {
    "pagination-absent": (
        "end-of-list inferred from a missing field",
        _sub(R,
             '  if (!("pagination" in b))\n'
             '    return { read: false, why: "alias list carries no pagination metadata, so the end of the list is not established" };',
             '  if (!("pagination" in b)) return { read: true, value: { resolved: new Map(), malformed: new Map(), endOfList: true, next: undefined } };'),
    ),
    "next-not-a-cursor": (
        "a non-cursor next becomes undefined",
        _sub(R,
             '    else return { read: false, why: `alias pagination.next is ${JSON.stringify(nx)}, which is not a cursor` };',
             '    else { endOfList = true; next = undefined; }'),
    ),
    "entry-not-an-object": (
        "uninterpretable entries skipped again",
        _sub(R,
             '      return { read: false, why: `alias list contains an entry that is not an object (${JSON.stringify(raw)})` };',
             '      continue;'),
    ),
    "host-not-readable": (
        "non-string host skipped again",
        _sub(R,
             '      return { read: false, why: `alias list contains an entry with no readable host (${JSON.stringify(a.alias)})` };',
             '      continue;'),
    ),
    "malformed-deployment-id": (
        "malformed deploymentId skipped",
        _sub(R,
             '      malformed.set(a.alias, `alias record carries a malformed deploymentId (${JSON.stringify(a.deploymentId)})`);',
             ''),
    ),
    "no-pagination-walk": (
        "stop after the first page",
        _sub(R,
             '    if (page.value.endOfList) break;            // the listing VERIFIABLY ended',
             '    break;'),
    ),
    "no-page-budget": (
        "page-budget guard removed (nontermination)",
        _cut(R, "    if (pages >= maxPages)",
             "  }\n\n  return { read: true, value: requiredHosts.map((host) => {"),
    ),
    "destination-value-unchecked": (
        "accept any read:true destination value",
        _cut(C, "  const invalid = requiredHosts",
             "  return null;\n}\n\n/** A receipt is only a receipt"),
    ),
    # ── round 3: the bootstrap, the lock, and the identity payload ───────
    "bootstrap-sends-a-credential": (
        "a header is put back on the guard fetch",
        _sub(P, 'curl -fsS -m 30 -o .p2bg "${guardUrl}"',
                'curl -fsS -m 30 -H "A: $T" -o .p2bg "${guardUrl}"'),
        PROVENANCE,
    ),
    "bootstrap-digest-unpinned": (
        "guard bytes executed without being verified",
        _sub(P, '&&[ "$(shasum -a 256 .p2bg|cut -c1-32)" = "${digest}" ]', '&&[ -s .p2bg ]'),
        PROVENANCE,
    ),
    "bootstrap-hashes-the-variable": (
        "digest taken through $(...) , which strips trailing newlines",
        _sub(P,
             'return `curl -fsS -m 30 -o .p2bg "${guardUrl}"&&[ "$(shasum -a 256 .p2bg|cut -c1-32)" = "${digest}" ]&&sh .p2bg&&npm run build`;',
             'return `g=$(curl -fsS -m 30 "${guardUrl}");[ "$(printf %s "$g"|shasum -a 256|cut -c1-32)" = "${digest}" ]&&echo "$g"|sh&&npm run build`;'),
        PROVENANCE,
    ),
    "unlock-swallows-every-error": (
        "an unlink failure reported as a release",
        _sub(R,
             '      try {\n'
             '        unlinkSync(path);\n'
             '      } catch (e) {\n'
             '        if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return;  // genuinely gone\n'
             '        throw e;\n'
             '      }',
             '      try { unlinkSync(path); } catch { /* already gone */ }'),
        CONTROL,
    ),
    "identity-leak-by-shorthand": (
        "a secret added to the payload as a shorthand property",
        _leak('const connectionString = process.env.DATABASE_URL ?? "";', "connectionString,"),
        PROVENANCE,
    ),
    "identity-leak-by-spread": (
        "a secret added to the payload behind a spread",
        _leak('const extra = { token: process.env.VERCEL_TOKEN ?? "" };', "...extra,"),
        PROVENANCE,
    ),
    "incomplete-disowns-the-intent-record": (
        "the INCOMPLETE refusal tells the operator the rollback target is missing",
        _sub(N,
             '`The rollback target remains in the earlier intent record; this message is the only record of ` +\n'
             '          `the failed verification and the failed recovery write.`',
             '`so the rollback target is NOT in the journal — it is only in this message.`'),
        CONTROL,
    ),
    "identity-leak-by-allowlisted-shorthand": (
        "a secret aliased to an ALLOW-LISTED name and passed as shorthand",
        _leak('const key = process.env.VERCEL_TOKEN ?? "";', "key,"),
        PROVENANCE,
    ),
    "identity-leak-by-getter": (
        "a secret returned from a getter, a property form the walker never saw",
        _insert_before(I, PAYLOAD_CALL,
                       "", then=(PAYLOAD_CALL,
                       '  return NextResponse.json({\n'
                       '    get key() { return process.env.VERCEL_TOKEN ?? ""; },\n'
                       '    deployment: {')),
        PROVENANCE,
    ),
    "identity-leak-by-parenthesized-alias": (
        "a secret aliased to an allow-listed name and wrapped in parentheses",
        _parenthesized_alias(),
        PROVENANCE,
    ),
    "identity-leak-through-response-headers": (
        "a secret returned in a ResponseInit header, outside the payload entirely",
        _leak_through_headers(),
        PROVENANCE,
    ),
    "identity-response-through-an-alias": (
        "a third return built through an alias, leaving the call count unchanged",
        _aliased_response(),
        PROVENANCE,
    ),
    "identity-response-is-not-a-literal": (
        "the payload moved into a variable, out of reach of the walker",
        _indirect_payload(),
        PROVENANCE,
    ),
}


def main(argv):
    if len(argv) >= 2 and argv[1] == "--list":
        for k in MUTATIONS:
            print(k)
        return 0
    if len(argv) >= 3 and argv[1] == "--label":
        return print(MUTATIONS[argv[2]][0]) or 0
    if len(argv) >= 3 and argv[1] == "--suite":
        e = MUTATIONS[argv[2]]
        return print(e[2] if len(e) > 2 else DEFAULT_SUITE) or 0
    if len(argv) >= 2 and argv[1] == "--suites":
        seen = []
        for e in MUTATIONS.values():
            su = e[2] if len(e) > 2 else DEFAULT_SUITE
            if su not in seen:
                seen.append(su)
        for su in seen:
            print(su)
        return 0
    if len(argv) >= 3 and argv[1] == "--apply":
        MUTATIONS[argv[2]][1]()
        return 0
    print(__doc__.strip())
    print("\nusage: _mutations.py --list | --label NAME | --suite NAME | --suites | --apply NAME")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
