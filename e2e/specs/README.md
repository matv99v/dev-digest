# specs — e2e

Prose specs for the browser suite, written **before** the flows are added.

> **`specs/` is prose. `../flows/` holds the runnable `*.flow.json` files** the runner
> executes. Don't put a flow file here — `run.ts` only reads `flows/`.

Name files `NN-short-name.md`. Use the template in
[`../../specs/README.md`](../../specs/README.md): goal · scope · out of scope · design ·
files touched · verification.

An e2e spec should name the journey being covered, the seeded data it relies on, and
the deterministic locators it will assert on — never the AI `chat` command.

_No specs yet._
