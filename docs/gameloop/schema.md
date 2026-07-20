# Game-loop JSON contract

`frontend/public/gameloop.json` is generated from the canonical
`docs/gameloop/vtes-v5-gameloop.dot` source. Do not edit the JSON by hand.

```bash
cargo run -p schrecknet-data -- gameloop
# Optional explicit paths:
cargo run -p schrecknet-data -- gameloop \
  --source docs/gameloop/vtes-v5-gameloop.dot \
  --out frontend/public/gameloop.json
```

The distiller intentionally supports only the DOT subset used by this artifact:
clusters, node/graph attributes, quoted multiline labels, ordinary nodes, and chained
directed edges. Nodes may set `level=basic` or `level=advanced`; without that attribute,
complexity is inferred from the region and first label line for compatibility with the
original graph. This keeps the build dependency-free. Unsupported syntax fails loudly;
undefined transition endpoints and incomplete hooks are rejected.

## Version 1

The TypeScript mirror lives in `frontend/src/lib/gameLoop.ts`.

| Field | Meaning |
| --- | --- |
| `version` | Contract version. Bump for breaking shape/semantic changes. |
| `source` | Repository-relative canonical DOT path. |
| `meta` | Diagram title and table player count. |
| `regions` | DOT clusters, with Basic/Advanced level and orthogonal-region flag. |
| `states` | Nodes in source order: first label line, remaining detail, visual kind, level, parent region, and attached timing hooks. |
| `transitions` | Every chained edge expanded into one `from`/`to` pair; dashed edges become conditional transitions and dotted hook edges become bridges. |
| `hooks` | `HK_*` nodes with their incoming FSM anchor, outgoing timing window, and future card-type mapping. `cardTypes` stays empty until M5 adds mappings to the DOT. |
| `impulseOrders` | Acting-first context orders distilled from the `IMP_ORDER_*` nodes' machine-readable attributes. |

State kinds are `state`, `decision`, `window`, `note`, and `hook`. Levels are
`basic` and `advanced`; transitions inherit Advanced when either endpoint is Advanced.
Unknown Graphviz presentation attributes are retained only during distillation and are
not emitted.

## Correctness anchors

Rust golden tests require:

- Unlock → Master → Minion → Influence → Discard in that order;
- all seven canonical combat steps in order;
- acting-first impulse contexts for combat/directed-at-one, directed-at-a-set, and
  undirected actions (prey → predator → remaining clockwise);
- representative turn/combat transitions, all 17 timing hooks, and the global hand
  region;
- structural equality between a fresh distillation and the committed JSON.
