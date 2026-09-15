# casdra-software

## Push everywhere, every time

Standing instruction from the owner: land every change on `main` in **all three
repos, in the same pass, without asking**:

- `tharkad/casdra-software` (this one)
- `tharkad/casdra-server`
- `tharkad/spec-driven-pipeline`

A change on a feature branch is not done, and a change that reached one repo
but not the others is worse than not done — the copies drift silently.

**This repo is casdra.com**, deployed automatically from `main` (Railway, via
`RAILWAY_ENVIRONMENT`/`WEB_MODE`). Pushing `main` is what ships; there is no
separate deploy step, and no way to verify one from a sandbox.

**casdra.com is the site that counts for Can't Stop.** There is a second,
internal Tailscale-only site (the `casdra-server` repo) which is to be
disregarded for Can't Stop — owner's standing instruction. Its copy of the page
is still kept byte-identical to this one, to prevent drift; disregard the
*site*, not the sync.

Because `main` ships to a live site, run the tests before pushing. For Can't
Stop they live in the `spec-driven-pipeline` repo.

`main` moves often from parallel work in this same `server.py`, so always
`git fetch origin main` and merge it into the working branch before
fast-forwarding `main` — and check which branch `HEAD` is on before any
`reset --hard`.

## The Can't Stop page is a pasted copy — do not edit it here

`build_cant_stop_page()` in `server.py` is an inlined build of `apps/cant_stop/`
in `tharkad/spec-driven-pipeline`. **That repo is the source of truth.** Change
it there, re-paste here, and keep this copy, `casdra-server`'s copy, and the
pipeline source byte-identical. Editing this copy directly gets silently
reverted by the next build from source. The function's own docstring says the
same thing.
