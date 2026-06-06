# X thread draft (operator posts)

Required elements present: pitch, demo video, GitHub, contract address, #MantleAIHackathon.
Drafts only. The operator posts; attach the video to tweet 1 and confirm the exact required hashtag
and tags on the official hackathon page before posting.

---

**1/**
Tokenized yields on-chain ask you to trust a number. Bombe replaces trust with a check anyone can rerun.

An autonomous AI attestor network for RWA yields on Mantle: agents fetch the data, the verdict is deterministic, every call is staked, and the contract refuses anything it cannot falsify.

#MantleAIHackathon
[attach demo video]

**2/**
The verdict is not a model's opinion. It is math.

Bombe reconciles the sources within a documented tolerance, compares to the asserted value, and writes the inputs and the result into a trace that is hashed on-chain. You can recompute the same verdict and the same hash yourself.

**3/**
For mETH, the yield is derived two ways from the same on-chain ground truth, so transport and staleness faults are caught.

For USDY, we say plainly: single source, full transparency. We do not call it independent and it does not catch issuer fraud. Honesty is the product.

**4/**
It is a record, not a screenshot.

A daily run attests both assets and includes self-tests that assert a deliberately wrong value, which it correctly rejects. The public streak contains VALID, REJECTED, and ABSTAIN. A network that only ever says yes is a rubber stamp.

**5/**
The strongest part: an external agent we did not write tries to attest a valuation, a judgment claim. The chain reverts it.

Blocked by protocol, not by our code. Bombe cannot attest what cannot be falsified, because the contract forbids it.

**6/**
Live on Mantle Sepolia today.

Try it: https://bombe-web.vercel.app
Code: https://github.com/jishnu-baruah/Bombe
AgentAttestation: 0xf2473a0a55D997233C8fBF987c197e7d2180470A

Mainnet: July 2026, after the public streak validates the loop.
