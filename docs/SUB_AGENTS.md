# Sub-agents (gated)

Stage agents may spawn **sub-agents** that share the same ticket worktree. Spawning is heavily gated so runs cannot fan out unboundedly.

## Who can spawn

Only agents with frontmatter `canSpawn: true` (Planner, Triage, Scope by default). Everyone else’s spawn blocks are ignored.

## Hard caps (Settings → Board)

| Setting | Default | Meaning |
|---------|---------|---------|
| `subAgentsEnabled` | on | Master kill switch |
| `maxSubAgentDepth` | 1 | `0` off; `1` stage→children; children need `canSpawn` + higher depth to nest |
| `maxSpawnsPerRound` | 2 | Max children from one spawn block |
| `maxSubAgentsPerStage` | 4 | Total children launched in one stage run |
| `maxSpawnRounds` | 2 | Spawn→resume loops per stage |
| `subAgentsParallel` | off | Sibling spawns parallel when on |

Also enforced:

- Reject unknown `agentId`
- Reject self-spawn
- Reject duplicate agent in the same block (one task per agent per round)
- Reject over-budget / over-round requests (logged as `[spawn-gate]`)
- Final resume round cannot spawn (forced DONE path)

## Protocol

````markdown
```railyard-spawn
[
  { "agentId": "implementer", "task": "Add HELLO.md with a one-line greeting" }
]
```
````

## UI

Ticket drawer **Agent activity** lists runs as a tree. Gate rejections appear in the parent log.
