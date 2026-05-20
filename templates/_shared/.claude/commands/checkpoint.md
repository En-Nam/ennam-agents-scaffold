---
description: Write a checkpoint file to .serena/checkpoint/.
---

Write a checkpoint to `.serena/checkpoint/<agent-name>-<YYYY-MM-DD>.md`. If today's file already exists, append a new session block (`## Session N — <time>`).

Required sections:

```markdown
# Checkpoint: <agent-name> — <date>

## What was done
- bullet list

## Files changed
- list

## Current state
- working / broken / partial

## Next steps
- ...

## Blockers / Risks
- ...
```

Keep it under 50 lines. Write the file before responding "done".
