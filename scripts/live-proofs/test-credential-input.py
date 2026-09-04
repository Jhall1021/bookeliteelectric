#!/usr/bin/env python3
"""
Fake-value tests for credential-input.sh.

    python3 scripts/live-proofs/test-credential-input.py

NO REAL CREDENTIAL IS EVER INVOLVED. Every case uses the obvious fake below and
a throwaway directory; P2B_LIVE_PROOFS_DIR exists so ~/.p2b-live-proofs is never
touched by a test.

Cases that need a terminal run on a REAL pty, because the behaviours worth
testing are terminal behaviours — echo suppression above all, which no pipe can
demonstrate. The pty is read until the child closes it: reading only until the
expected text appears deadlocks once the buffer fills.

Three defects were found by these tests rather than by reading the script: the
prompt printed before echo was disabled, a failing `stty -echo` was silent and
stored the value anyway, and a failed run left an empty file that blocked the
retry.
"""
import os, pty, select, shutil, signal, stat, subprocess, sys, tempfile, time

HELPER = "scripts/live-proofs/credential-input.sh"
FAKE = "FAKE-VALUE-not-a-real-token-0123456789"
results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  {'ok  ' if ok else 'FAIL'}  {name}" + (f"   {detail}" if detail else ""))


def drive(env_dir, send=None, delay=0.0, hangup=False, extra_env=None):
    """Run the helper on a pty. Returns (transcript, exit_code)."""
    env = dict(os.environ, P2B_LIVE_PROOFS_DIR=env_dir)
    if extra_env:
        env.update(extra_env)
    pid, fd = pty.fork()
    if pid == 0:
        try:
            os.execvpe("sh", ["sh", HELPER, "vercel"], env)
        except Exception:
            os._exit(127)
    buf, sent, t0 = b"", False, time.time()
    while time.time() - t0 < 12:
        r, _, _ = select.select([fd], [], [], 0.2)
        if not r:
            continue
        try:
            chunk = os.read(fd, 4096)
        except OSError:
            break
        if not chunk:
            break
        buf += chunk
        if not sent and b"value: " in buf:
            if delay:
                time.sleep(delay)
            if hangup:
                os.close(fd); fd = -1; sent = True
                break
            os.write(fd, send); sent = True
    if fd != -1:
        try: os.close(fd)
        except OSError: pass
    _, status = os.waitpid(pid, 0)
    return buf.decode(errors="replace"), os.waitstatus_to_exitcode(status)


def mode(path):
    return oct(stat.S_IMODE(os.stat(path).st_mode))[2:]


def main():
    if not os.path.exists(HELPER):
        print(f"cannot find {HELPER} — run from the repository root", file=sys.stderr)
        return 2
    root = tempfile.mkdtemp(prefix="p2b-credtest-")
    try:
        # ---- cases that need no terminal ------------------------------------
        d = f"{root}/notty"
        r = subprocess.run(["sh", HELPER, "vercel"], stdin=subprocess.DEVNULL,
                           capture_output=True, text=True,
                           env=dict(os.environ, P2B_LIVE_PROOFS_DIR=d))
        check("stdin is not a terminal is refused",
              r.returncode != 0 and "not a terminal" in r.stderr)

        os.makedirs(f"{root}/real", exist_ok=True)
        os.symlink(f"{root}/real", f"{root}/dirlink")
        r = subprocess.run(["sh", HELPER, "vercel"], stdin=subprocess.DEVNULL,
                           capture_output=True, text=True,
                           env=dict(os.environ, P2B_LIVE_PROOFS_DIR=f"{root}/dirlink"))
        check("a symlinked directory is refused",
              r.returncode != 0 and "symlink" in r.stderr)

        d = f"{root}/exists"; os.makedirs(d); open(f"{d}/vercel-token", "w").write("PRE-EXISTING")
        r = subprocess.run(["sh", HELPER, "vercel"], stdin=subprocess.DEVNULL,
                           capture_output=True, text=True,
                           env=dict(os.environ, P2B_LIVE_PROOFS_DIR=d))
        check("an existing token file is refused, not overwritten",
              r.returncode != 0 and open(f"{d}/vercel-token").read() == "PRE-EXISTING")

        d = f"{root}/filelink"; os.makedirs(d)
        target = f"{root}/should-never-exist"
        os.symlink(target, f"{d}/vercel-token")
        r = subprocess.run(["sh", HELPER, "vercel"], stdin=subprocess.DEVNULL,
                           capture_output=True, text=True,
                           env=dict(os.environ, P2B_LIVE_PROOFS_DIR=d))
        check("a symlinked token file is refused, target untouched",
              r.returncode != 0 and not os.path.exists(target))

        d = f"{root}/loose"; os.makedirs(d, mode=0o777); os.chmod(d, 0o777)
        subprocess.run(["sh", HELPER, "vercel"], stdin=subprocess.DEVNULL,
                       capture_output=True, env=dict(os.environ, P2B_LIVE_PROOFS_DIR=d))
        check("a loose directory mode is tightened to 0700", mode(d) == "700", f"mode {mode(d)}")

        # ---- the echo-disable failure ---------------------------------------
        # A shim that fails ONLY for `stty -echo`, so the helper's own status
        # check is what is under test rather than the terminal.
        shim = f"{root}/shim"; os.makedirs(shim)
        with open(f"{shim}/stty", "w") as f:
            f.write('#!/bin/sh\ncase "$1" in\n  -echo) exit 1 ;;\n  *) exec /bin/stty "$@" ;;\nesac\n')
        os.chmod(f"{shim}/stty", 0o755)
        d = f"{root}/echofail"
        out, code = drive(d, send=FAKE.encode() + b"\n",
                          extra_env={"PATH": f"{shim}:{os.environ['PATH']}"})
        check("echo-disable failure exits nonzero", code != 0, f"exit {code}")
        check("echo-disable failure prompts for nothing", "value: " not in out)
        check("echo-disable failure stores nothing",
              not os.path.exists(f"{d}/vercel-token"))
        check("echo-disable failure leaves no empty file",
              not os.path.exists(f"{d}/vercel-token"))

        # ---- terminal cases --------------------------------------------------
        d = f"{root}/happy"
        out, code = drive(d, send=FAKE.encode() + b"\n")
        tok = f"{d}/vercel-token"
        check("a value typed at the prompt is stored", code == 0 and os.path.exists(tok)
              and open(tok).read() == FAKE, f"exit {code}")
        check("the stored file is 0600 and its directory 0700",
              os.path.exists(tok) and mode(tok) == "600" and mode(d) == "700")
        check("the value is never echoed to the terminal", FAKE not in out)

        out, code = drive(f"{root}/happy2", send=FAKE.encode() + b"\n", delay=0.5)
        check("still not echoed when sent after a pause", FAKE not in out and code == 0)

        d = f"{root}/eof"
        out, code = drive(d, send=b"\x04")
        check("Ctrl-D at the prompt refuses and stores nothing",
              code != 0 and not os.path.exists(f"{d}/vercel-token"), f"exit {code}")

        d = f"{root}/empty"
        out, code = drive(d, send=b"\n")
        check("an empty line refuses and stores nothing",
              code != 0 and not os.path.exists(f"{d}/vercel-token"), f"exit {code}")

        d = f"{root}/hup"
        out, code = drive(d, hangup=True)
        check("a hangup refuses and leaves no empty file",
              code != 0 and not os.path.exists(f"{d}/vercel-token"), f"exit {code}")

        out, code = drive(f"{root}/happy", send=b"SECOND-FAKE-VALUE\n")
        check("a second run will not overwrite the first",
              code != 0 and open(f"{root}/happy/vercel-token").read() == FAKE)
    finally:
        shutil.rmtree(root, ignore_errors=True)

    failed = [n for n, ok, _ in results if not ok]
    print(f"\n  {len(results) - len(failed)} passed, {len(failed)} failed.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
