#!/bin/bash
# Makes VIRALOT-HANDOFF-WITH-KEYS.md: the integration guide with your API keys filled in.
# Keys are typed hidden (or taken from .env.local) and never shown on screen.
set -euo pipefail
cd "$(dirname "$0")"
get() { grep -E "^$1=" .env.local 2>/dev/null | head -1 | cut -d= -f2- || true; }
ask() {
  local name=$1 label=$2 cur; cur=$(get "$name")
  if [ -n "$cur" ]; then read -r -p "$label: found in .env.local. Use it? [Y/n] " yn </dev/tty
    [[ "$yn" =~ ^[Nn] ]] || { export "$name=$cur"; return; }; fi
  read -r -s -p "$label (paste, hidden; Enter to skip): " v </dev/tty; echo
  export "$name=$v"
}
ask HF_CREDENTIALS "Higgsfield key (key_id:key_secret)"
ask FIRECRAWL_API_KEY "Firecrawl key (fc-...)"
ask ANTHROPIC_API_KEY "Anthropic key (sk-ant-..., optional)"
umask 077
python3 - <<'PY'
import os
s=open('VIRALOT-INTEGRATION.md').read()
for k in ('HF_CREDENTIALS','FIRECRAWL_API_KEY','ANTHROPIC_API_KEY'):
    v=os.environ.get(k,'').strip()
    if v.lower().startswith('key '): v=v[4:].strip()
    s=s.replace('{{%s}}'%k, v or '{{%s}}'%k)
open('VIRALOT-HANDOFF-WITH-KEYS.md','w').write(s)
PY
echo "Done: $(pwd)/VIRALOT-HANDOFF-WITH-KEYS.md (only you can read it). Keys left blank stay as {{...}}."
