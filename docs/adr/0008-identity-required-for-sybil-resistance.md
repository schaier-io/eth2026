# Identity Required For Sybil Resistance

Status: accepted

TruthMarket's current hackathon contract treats one wallet address as one potential selected juror. That keeps the demo simple, but it is not Sybil-resistant: one participant can split stake across many wallets and increase their chance of being selected into the count-based jury.

Future production versions must require an identity or eligibility layer before addresses can enter jury selection. The exact mechanism is deferred, but it must provide a credible one-eligible-identity-to-one-jury-entry boundary for the target market. ENS display alone is not enough; identity must affect voter eligibility, jury eligibility, or both.

**Accepted Direction**

- Keep the hackathon contract address-based and document it as demo-grade.
- Treat identity-backed eligibility as a production requirement for random-jury belief resolution.
- Allow multiple possible implementations: ENS-linked reputation, allowlisted credentials, proof-of-personhood, organization membership, or another domain-appropriate identity system.
- Keep conviction and stake economics as economic exposure, not as a replacement for Sybil resistance.

**Consequences**

- Count-based jury voting is only defensible in production if jury entries are identity-gated or otherwise Sybil-resistant.
- `minStake` can raise attack cost, but it does not solve address splitting by itself.
- Future frontend and service work should model an eligibility check before commitment or before jury selection.
- Claim/rules documents should disclose the eligibility mechanism used by the market.
