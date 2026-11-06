# Architecture diagrams

PlantUML sources for the acoustic evidence architecture and the two flows that matter for
the proof path. They are deliberately box-first and low-detail: each should be readable in a
slide or code review without zooming.

The teacher-confirmed attendance register, queries, exports and super-admin console are
documented in [the route reference](../routes.md) and [how it works](../how-it-works.md).
These diagrams focus on the acoustic/evidence path and do not replace that product map.

| File | What it shows | Use it for |
| --- | --- | --- |
| `system-components.puml` | Teacher phone, student phone, the Express service, MongoDB, Google Identity, the acoustic channel, the PDF text-preview path and the gated Layer 3 block | Orientation and architecture reviews |
| `check-in-flow.puml` | End-to-end check-in from the teacher starting a wave through student consent, discovery, decoding, evidence submission, the teacher evidence card and the evidence-gated wave advance; the gated future is a separate swimlane | Explaining what is built vs what is still blocked |
| `proof-transport.puml` | The proof sequence: canonical message, device signature, guards, validation, `201`/`200`, evidence TTL | Security and API reviews of the proof endpoint |

## Render

The owner's editor already renders these. From a terminal with PlantUML available:

```bash
java -jar plantuml.jar -tsvg docs/diagrams/*.puml
# or, if `plantuml` is on PATH:
plantuml -tsvg docs/diagrams/*.puml
```

Open the generated `.svg` files in a browser. Sources were last checked with PlantUML
**1.2024.3** using `-checkonly` and rendered to SVG/PNG with `layout smetana` (no Graphviz
required).

## Reading the status colours

- **Normal boxes** are built and present in the working tree.
- **Red `NOT BUILT · gated` box** is Layer 3 (automatic scoring, ID round, neighbour review).
  It is not built and is not part of the current evidence-only acoustic pilot.
- **Teacher-confirmed attendance** is built in the product layer but is not drawn in these
  acoustic diagrams. It is a separate admin/register flow fed by the same proof evidence.
- **Layer 1 is an assumption:** the owner directed that the physical gate be treated as
  passed for build planning only. The measured 5 m/10 m sweep still fails and reverse/muted
  control remain unmeasured; the diagrams do not claim otherwise.
- The orange dashed link between the phones is sound, not a network call. The server never
  hears the room.

Keep these diagrams aligned with `plan.md`, `progress.md` and `docs/routes.md`. If an
endpoint, component or gate changes, update the diagram in the same session.
