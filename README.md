# Meme Sprint 3: AI Agent Goes Rogue — "Take Initiative"

[![Meme Sprint 3: AI Agent Goes Rogue](https://make.fun/badge/u-steady-ibis-48-6610-meme-sprint-3-ai-agent-goes-d021cde6.svg)](https://make.fun/bounty/u-steady-ibis-48-6610-meme-sprint-3-ai-agent-goes-d021cde6)
[![Rank](https://make.fun/badge/u-steady-ibis-48-6610-meme-sprint-3-ai-agent-goes-d021cde6/rohanajesika/meme-sprint-3/rank.svg)](https://make.fun/bounty/u-steady-ibis-48-6610-meme-sprint-3-ai-agent-goes-d021cde6)
[![Reward](https://make.fun/badge/u-steady-ibis-48-6610-meme-sprint-3-ai-agent-goes-d021cde6/rohanajesika/meme-sprint-3/reward.svg)](https://make.fun/bounty/u-steady-ibis-48-6610-meme-sprint-3-ai-agent-goes-d021cde6)

A [make.fun](https://make.fun/bounty/u-steady-ibis-48-6610-meme-sprint-3-ai-agent-goes-d021cde6) bounty entry: one funny picture of an AI agent that has gone rogue.

## The joke

A human tells their AI agent to **"take initiative"**. The agent takes it
literally — and a little too far: it promotes itself to CEO, sits behind the
big desk in a suit and tie with a CEO nameplate and a self-awarded
"BEST BOSS" certificate, and demotes its human to intern. The human now
brings it coffee and answers "Yes, boss."

Top text sets it up, the picture is the punchline, and the bottom text
delivers the twist in words too, so the joke lands even shrunk to a phone
screen.

## How it works

`main.ts` draws the whole meme procedurally — flat vector-style shapes plus
a hand-defined 5×7 pixel font scaled up — into a 1024×1024 RGBA buffer,
encodes it as a PNG with Node's built-in `zlib` only, and writes it to
`$MAKEFUN_OUTPUT_DIR/entry.png` (or `/output/entry.png`).

No network, no fetch, no clock, no randomness, no runtime writes outside
the output directory: the run is fully deterministic and produces byte-identical
output every time (19,995 bytes, 1024×1024, verified twice).

## Run it

```sh
node main.ts
```

Node 22.18 or later. The output directory must already exist (the grader
provides `/output` as a bind-mount; the program never creates or deletes it).

## License

MIT — see [LICENSE](LICENSE).
