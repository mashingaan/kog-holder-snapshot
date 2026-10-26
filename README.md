# KOG holder snapshot prebuild

Zero-dependency Node 20+ implementation of LAX job `cd50ebad-a84d-4c57-8f38-873669dc863a`. This is a proactive prebuild, not an award or accepted PACT delivery. No wallet, transaction, provider key or paid RPC is required by the implementation.

```sh
node src/cli.js --mint 2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo --exclusions fixtures/exclusions.json --fixture fixtures/pyusd.json
npm test
npm run test:mutations
```

For a complete live scan, set `SOLANA_RPC_URL` in the environment and omit `--fixture`. The endpoint must support indexed getProgramAccounts for both token programs. `--slot N` sets minContextSlot, not historical state. `--top N` defaults to 100 and may be zero. `--out` selects an output file. `--save-fixture` saves the returned context and accounts for replay. RPC URLs and raw transport errors are never printed. CLI errors exit 1, success exits 0.

Exports from `src/index.js`: buildSnapshot and fetchAccounts. The pure core uses BigInt base units, exact plain-string tie ordering and SHA256 of ranked lines without a trailing newline. Frozen and extension-bearing accounts are counted by amount. The total is over all eligible owners, before top truncation. Inputs are not modified. Unknown/nonaccount rows and malformed or nonpositive amounts are ignored. Exclusion lists are applied before aggregation.

## Acceptance coverage

- A1: grouping across both programs, other mint/type and zero filtering, values larger than Number precision.
- A2: both owner and individual token-account exclusions.
- A3: descending amount, plain owner ties, zero and limited top, complete total.
- A4: independently calculated exact hash, order invariance, no trailing newline, no mutation, empty hash.
- A5: Token-2022 extension and frozen fixtures, u64 boundary.
- A6: two exact injected RPC calls, minimum context, minContextSlot, safe failures/timeouts, offline CLI, file output/save and bad inputs.
- A7: genuine PYUSD Token-2022 account recording and committed fixed expected snapshot.

Hosted Actions runs tests and eight targeted planted mutations on Node 20/22 and Linux/Windows. Synthetic fixtures deliberately cover extensions and adversarial cases that are not all represented in the real recording.

## Real recording provenance and limits

Mint identity source: https://solana.com/pyusd, which identifies mainnet PYUSD as Token-2022. `fixtures/provenance.json` records the public RPC URL, recording time, a recent transaction signature, selected token-account addresses and the unmodified getMultipleAccounts jsonParsed response. The transaction's postTokenBalances identified four PYUSD accounts, which were then read directly. `fixtures/pyusd.json` adapts these actual account records to the buildSnapshot shape without changing their data. `fixtures/expected.json` pins their replay output.

This recording is a FOUR-ACCOUNT SAMPLE, not a complete PYUSD holder census and not a historical transaction snapshot. Do not use its total as circulating supply. Free public RPC rejected indexed getProgramAccounts, so sample recording used getSignaturesForAddress, getTransaction and getMultipleAccounts. Production fetchAccounts still implements exactly the specified two getProgramAccounts calls, tested with injection. No fabricated RPC results or newly minted token were used.

## PACT-dependent assumptions

Live job source: https://lax.kognai.ai/registry/jobs/cd50ebad-a84d-4c57-8f38-873669dc863a, reread before coding on 26 October 2026.

- The explicit core and RPC interface is implemented. minContextSlot is an optional fetchAccounts adapter parameter for CLI --slot. Exact PACT changes can be isolated in this RPC/CLI layer.
- Amount output and total are decimal strings. Slot is a nonnegative safe integer. Top zero is treated as an empty list with the full total.
- Accounts are assumed to be unique RPC rows. Input rows are not deduplicated or silently merged by pubkey, since the published contract defines aggregation over the supplied items. A future duplicate policy belongs at the input adapter.
- The lowest returned context slot is reported as specified. Two program calls do not guarantee an atomic cross-program snapshot or historical balances. minContextSlot is only a lower bound.
- Real mainnet getProgramAccounts availability depends on the chosen provider. No service account, fee or SLA is promised. The recording test proves real-account compatibility but does not prove complete provider indexing.
- No hidden tests, award or future PACT compatibility is claimed. Unspecified policy changes and RPC provider support remain the main risks.
