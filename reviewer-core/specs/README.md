# specs — reviewer-core

A spec per feature scoped to the review engine, written **before** it is built. A
feature that also changes the server or client belongs in the root `../../specs/`.

Name files `NN-short-name.md`. Use the template in
[`../../specs/README.md`](../../specs/README.md): goal · scope · out of scope · design ·
files touched · verification.

An engine spec should say what it adds to the public surface (`src/index.ts`), which
prompt slot it feeds, and how it stays free of DB, GitHub, and filesystem access.

_No specs yet._
