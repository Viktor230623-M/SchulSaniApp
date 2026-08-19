#!/usr/bin/env bash
# Subagent-Spawner: startet claude -p read-only Agents parallel (Wellen à 5).
# Reports nach ops/agents/reports/<name>.md. Nichts wird verändert.
#
# Nutzung:
#   bash ops/agents/spawn.sh                     # alle Briefe
#   bash ops/agents/spawn.sh name1 name2 ...     # nur bestimmte
set -u
cd "$(cd "$(dirname "$0")" && pwd)"   # ops/agents
ROOT="$(cd ../.. && pwd)"
cd "$ROOT"

AGENTS_DIR="ops/agents"
BRIEFS_DIR="$AGENTS_DIR/briefs"
REPORTS_DIR="$AGENTS_DIR/reports"
mkdir -p "$REPORTS_DIR"

if [ $# -gt 0 ]; then
  names=("$@")
else
  names=()
  for f in "$BRIEFS_DIR"/*.md; do
    [ -e "$f" ] || continue
    names+=("$(basename "$f" .md)")
  done
fi

if [ ${#names[@]} -eq 0 ]; then
  echo "Keine Briefe gefunden in $BRIEFS_DIR — lege dort .md-Dateien an."
  exit 1
fi

WAVE=5
LOG="$AGENTS_DIR/spawn.log"
: > "$LOG"
echo "Start $(date '+%H:%M:%S'): ${#names[@]} Agent(s)" | tee -a "$LOG"

run_wave() {
  local pids=()
  for name in "$@"; do
    brief_file="$BRIEFS_DIR/$name.md"
    if [ ! -f "$brief_file" ]; then
      echo "FEHLT: $brief_file" | tee -a "$LOG"
      continue
    fi
    brief=$(cat "$brief_file")
    (
      claude -p "$brief" \
        --allowedTools "Read,Glob,Grep" \
        --disallowedTools "Bash,Write,Edit" \
        --output-format text \
        > "$REPORTS_DIR/$name.md" 2> "$REPORTS_DIR/$name.err"
      echo "DONE $name ($?)" >> "$LOG"
    ) &
    pids+=($!)
  done
  for p in "${pids[@]}"; do wait "$p"; done
}

i=0
while [ $i -lt ${#names[@]} ]; do
  run_wave "${names[@]:i:WAVE}"
  i=$((i + WAVE))
  echo "Wave fertig ($i/${#names[@]}) $(date '+%H:%M:%S')" >> "$LOG"
done

echo "FERTIG $(date '+%H:%M:%S')" | tee -a "$LOG"
echo "=== Reports: $(ls "$REPORTS_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ') ==="
