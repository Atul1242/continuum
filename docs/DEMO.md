# Demo script & judging notes

## 90-second live demo

Run `npm run dev`, then:

1. **Set the scene (10s).** Open `http://localhost:5173/?user=demo`. A payments operations dashboard loads — transactions/min, failed count, a failure-rate chart, a gateway status, an incident note. Point out the workflow stepper (Layout → Configure → Review → Publish) and the "Synced" indicator.

2. **Do some real work and leave it unfinished (20s).** Move the **Review** step. Select the "Failed (last hour)" metric and change its value in the inspector — *don't* save it (note the "unsaved" badge and the "N unsaved" status). Start adding a new **Chart** from the palette, type a title, but *don't* click "Add to canvas."

3. **Switch devices (20s).** Hit **Copy link** (it captures your `?user=&room=` URL) and open it in a *second* window — this stands in for picking up a tablet. A banner appears: *"Welcome back — you were on the Review step, editing 'Failed (last hour)', 1 unsaved change, a half-finished chart. Last active on Laptop just now."* Click **Resume**: the second window jumps to the Review step, re-selects the metric with the unsaved edit still pending, and the half-finished chart form is back. This is the headline moment — operational state, not just data.

4. **Go offline and keep working (20s).** In either window click **Simulate offline** (status turns red). Keep editing — drag widgets, change values. Click **Come back online**: the edits reconcile instantly. Nothing was lost; nothing had to be manually replayed.

5. **Show conflict resolution (20s).** Open `?user=a` and `?user=b` side by side. Type into the same incident Note in both at once — the text merges character by character. Open the **Activity** panel to show each merge logged.

## How it scores against the criteria

| Criterion | Weight | Where it's demonstrated |
|-----------|--------|--------------------------|
| **Technical implementation** | 25% | Three-layer CRDT state model; a sync provider and relay written from scratch on `y-protocols` (not an off-the-shelf server); local-first IndexedDB durability; a conflict-free textarea↔Y.Text binding; the state-based-sync insight that removes the need for a replay queue. All in strict TypeScript, type-checked and building clean. |
| **Innovation & originality** | 20% | The distinction between restoring *data* and reconstructing the *operator*. Separating committed / draft / session state, and resuming selection, workflow stage, scroll, and half-finished actions — not just the document — is the original contribution. |
| **Problem solving & impact** | 20% | Directly answers every "expected output" in the brief: capture, sync, conflict resolution, cross-device recovery, offline/online, unfinished-workflow restoration — with a concrete operator use case. |
| **User experience** | 15% | A considered, non-generic interface; a resume banner that explains in plain language exactly what will be restored; live presence; a legible activity/merge log; clear connection state. |
| **Scalability & feasibility** | 10% | Local-first means the server is an accelerator, not a dependency. CRDTs scale horizontally; the relay is stateless beyond a per-workspace document. Limitations and the path past them are documented honestly in the architecture. |
| **Presentation & demonstration** | 10% | This script; a README that frames the problem; an architecture document with a data-flow diagram and stated trade-offs. |

## Rules to win (the strategy behind the build)

1. **Lead with the one moment that can't be faked.** The device-switch resume is a 15-second "wow" judges grasp instantly. Everything else supports it. Open and close on it.
2. **Make the invisible visible.** Sync and merges normally happen silently. The status pill, the unsaved badges, the resume banner, and the activity log turn the engineering into something a judge can *see*. Points you can't demonstrate don't score.
3. **Depth over surface.** Writing the sync layer by hand (instead of importing a server) is the difference between "wired up a library" and "understands distributed state." The code-verification check rewards this.
4. **Be honest about limits.** A documented "no auth yet, here's where it goes" reads as engineering maturity and protects the Scalability score; hand-waving invites hard questions.
5. **Keep it original and coherent.** One authored design system, consistent naming, meaningful commits, no templated boilerplate, no AI-tell. Every file should look like the same person wrote it on purpose.
6. **Know your own code.** The demo tells a story; be ready to open `provider.ts` and explain state-based sync, and `session.ts` and explain the committed/draft/session split. The strongest answer to a verification question is a clear one.
