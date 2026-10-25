# Architecture diagrams

PlantUML sources for the high-level map and the two flows that matter right now. They are deliberately box-first and low-detail: each one should be readable in a slide or a code review without zooming.

| File | What it shows | Use it for |
| --- | --- | --- |
| `system-components.puml` | The component map: teacher phone, student phone, the Express service, MongoDB, Google Identity, the acoustic channel, and the gated Layer 3 block | Orientation and architecture reviews |
| `check-in-flow.puml` | End-to-end check-in from the teacher starting a wave to the current evidence-only stop, with the gated future in its own swimlane | Explaining what is built vs what is still blocked |
| `proof-transport.puml` | The Layer 2.3 sequence: canonical message, device signature, guards, validation, `201`/`200`, evidence TTL | Security and API reviews of the proof endpoint |

## Render

The owner's editor already renders these. From a terminal with PlantUML available:

```bash
java -jar plantuml.jar -tsvg docs/diagrams/*.puml
# or, if `plantuml` is on PATH:
plantuml -tsvg docs/diagrams/*.puml
```

Open the generated `.svg` files in a browser. Sources were checked with PlantUML **1.2024.3** using `-checkonly` and rendered to SVG/PNG with `layout smetana` (no Graphviz required).

## Reading the status colors

- **Normal boxes** are built and present in the working tree.
- **Grey `PLANNED` box** is the next student-facing slice, not built yet.
- **Red `NOT BUILT · gated` box** is Layer 3. It must not start before the Layer 1 gate is decided.
- The orange dashed link between the phones is sound, not a network call. The server never hears the room.

Keep these diagrams aligned with `plan.md` and `progress.md`. If an endpoint, component, or gate changes, update the diagram in the same session.
