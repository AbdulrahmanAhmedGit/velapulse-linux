"""The shipped modules must form a closed import graph in both install roots."""
import re, shlex
from pathlib import Path
root=Path(__file__).resolve().parents[1]
lines=(root/'scripts/install-user.sh').read_text().splitlines()
for destination in ['$data/gnome-shell/extensions/velapulse@velapulse.local/', '$data/velapulse/extension/']:
    shipped={}
    for line in lines:
        words=shlex.split(line)
        if words and words[0]=='cp' and words[-1]==destination:
            for path in words[1:-1]:
                source=root/path
                if source.suffix=='.js':shipped[source.name]=source
    assert shipped,destination
    for name,path in shipped.items():
        for target in re.findall(r"(?:from\s*|import\s*)['\"]\./([^'\"]+\.js)['\"]",path.read_text()):
            assert target in shipped,f'{destination}{name} imports unshipped {target}'
    print('PASS installed JavaScript import closure:',destination,len(shipped),'modules')
