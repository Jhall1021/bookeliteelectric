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


def _sub(path, old, new):
    def go():
        p = pathlib.Path(path)
        s = p.read_text()
        if old not in s:
            raise SystemExit(f"pattern not found in {path}")
        p.write_text(s.replace(old, new, 1))
    return go


def _cut(path, start, end):
    def go():
        p = pathlib.Path(path)
        s = p.read_text()
        i, j = s.index(start), s.index(end)
        p.write_text(s[:i] + s[j:])
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
}


def main(argv):
    if len(argv) >= 2 and argv[1] == "--list":
        for k in MUTATIONS:
            print(k)
        return 0
    if len(argv) >= 3 and argv[1] == "--label":
        return print(MUTATIONS[argv[2]][0]) or 0
    if len(argv) >= 3 and argv[1] == "--apply":
        MUTATIONS[argv[2]][1]()
        return 0
    print(__doc__.strip())
    print("\nusage: _mutations.py --list | --label NAME | --apply NAME")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
