import os, pty, select, time, sys, re, json
OUT = sys.argv[1] if len(sys.argv) > 1 else 'run'
COLS, ROWS = 200, 60
env = dict(os.environ, TERM='xterm-ghostty', TERM_PROGRAM='ghostty', COLUMNS=str(COLS), LINES=str(ROWS))
for k in list(env):
    if k.startswith('CLAUDE_CODE_') or k in ('CLAUDECODE','CLAUDE_JOB_DIR'): env.pop(k)
env['CLAUDE_CODE_FORCE_TERMINAL_IMAGES'] = '1'
env['CLAUDE_CODE_PLUGIN_DIRS'] = os.path.expanduser('~/Clauwler')
env['CLAUDE_CODE_ENABLE_FUNCTION_HOOKS'] = '1'
pid, fd = pty.fork()
if pid == 0:
    os.chdir(os.path.expanduser('~/Clauwler'))
    os.execvpe('claude', ['claude'], env)
import fcntl, termios, struct
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', ROWS, COLS, 0, 0))
log = open(f'{OUT}.raw', 'wb')
events = []
t0 = time.time()
buf = b''
def reply(data):
    # Answer the terminal queries Ghostty would answer.
    r = b''
    if b'\x1b[c' in data or b'\x1b[0c' in data: r += b'\x1b[?62;22;52c'
    if b'\x1b[>0q' in data or b'\x1b[>q' in data: r += b'\x1bP>|ghostty 1.2.0\x1b\\'
    if b'\x1b[?u' in data: r += b'\x1b[?0u'
    if b'\x1b[6n' in data: r += b'\x1b[1;1R'
    if b'\x1b]11;?' in data: r += b'\x1b]11;rgb:1e1e/1e1e/2e2e\x1b\\'
    if b'\x1b]10;?' in data: r += b'\x1b]10;rgb:dddd/dddd/dddd\x1b\\'
    if b'\x1b[14t' in data: r += b'\x1b[4;1200;2000t'
    if b'\x1b[16t' in data: r += b'\x1b[6;20;10t'
    for m in re.finditer(rb'\x1b_G([^;\x1b]*);[^\x1b]*\x1b\\\\', data):
        ctl = m.group(1)
        if b'a=q' in ctl:
            i = re.search(rb'i=(\d+)', ctl)
            r += b'\x1b_Gi=' + (i.group(1) if i else b'1') + b';OK\x1b\\'
    if r: os.write(fd, r)
def pump(secs):
    end = time.time() + secs
    while time.time() < end:
        rl, _, _ = select.select([fd], [], [], 0.02)
        if rl:
            try: d = os.read(fd, 1 << 20)
            except OSError: return
            if not d: return
            log.write(d)
            events.append((time.time() - t0, len(d), d.count(b'\x1b_G'), len(re.findall(rb'\x1b_G[^\x1b]*a=T', d)) + len(re.findall(rb'\x1b_G[^\x1b]*a=t', d))))
            reply(d)
def send(s):
    os.write(fd, s.encode() if isinstance(s, str) else s)
pump(6)
send('\r'); pump(2)   # a trust prompt, if any
send('/clauwler'); pump(0.5); send('\r'); pump(4)
mark = time.time() - t0
keys = 'ddddssssqqqqzzzzdddrrssseeqqzz'
for k in keys * 2:
    send(k); pump(0.12)
pump(2)
end = time.time() - t0
send('\x1b'); pump(0.5); send('\x03'); pump(0.5); send('\x03'); pump(1)
try: os.kill(pid, 9)
except: pass
play = [e for e in events if mark <= e[0] <= end]
dur = end - mark
tot = sum(e[1] for e in play)
print(json.dumps({'play_secs': round(dur,1), 'bytes_per_s': int(tot/dur), 'chunks': len(play), 'graphics_cmds': sum(e[2] for e in play), 'transmits': sum(e[3] for e in play), 'max_gap_ms': int(max((b[0]-a[0] for a,b in zip(play, play[1:])), default=0)*1000)}))
