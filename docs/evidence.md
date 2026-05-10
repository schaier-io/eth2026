# Evidence

This file records demo evidence for agent-created TruthMarket markets. It is operational evidence for deployments, agent actions, and transaction results. It is not market outcome evidence and does not make Apify, the operator, or this document an external truth source.

## Sepolia Agent Demo

Recorded: 2026-05-10 Europe/Prague

Network:

- Chain: Sepolia
- Chain id: `11155111`
- RPC used: `https://ethereum-sepolia-rpc.publicnode.com`
- Agent signer: `0x8FA04dc0762F14441a25829C21BCF27DdE854Bf3`
- Funding received: `0.05` Sepolia ETH
- Post-run balance observed by RPC: `0.0499889543213173` Sepolia ETH

Deployed contracts:

- Stake token: `0x185fF8d7ce000c4D97B875b6dA1e64cE10946284`
- Discovery registry: `0xfe962825e8088145d996fc7daa1d89df3903be45`
- Market factory: `0x5747eb672f4e8d7a7338521b0a55f0d871aaefaa`

Deployment transactions:

- Stake token deployment: `0x895625f622b9d2199a9007be8dee23781d3e6dc16679c37841791538633eefed`
- Discovery registry deployment: `0xf79de8925868ff8c0bae79958436ca45600d8b67cf38ecdf3ca3cafcb9ff2288`
- Market factory deployment: `0xc03770c10721a21e344d6e218f42ecb78f0f4b217dc2e95800e451ecd3c8ef5f`

Agent-created market:

- Market address: `0x5FD1469eD5EE5d3E68Baf93693a6E88400a703EA`
- Creation transaction: `0x26c34fa43bef7416b0eba2492905801e328d6c03fc257fcf96f33d2ad9d1f3f2`
- Candidate id: `demo-1`
- Candidate source: `https://reddit.com/r/AskReddit/comments/demo-1`
- Market name: `Do selected jurors believe this Reddit question is credible: Is this front-page screenshot real or fake?`

Vote evidence:

- Stake approval transaction: `0x194a8a6a17011d1ceef72fc7fd3727318ae0b48a829b14581e3c56a5784c50f0`
- Vote: `YES`
- Stake: `5000000000000000000` base units
- Commit transaction: `0x45d5273f12f3be084b91efe3ce7275d556b31f66237021b0ee180aca0352ac31`
- Commit hash: `0xdc25b9f0ff8253902d208beb3b14522fdd3f7d34a10292fea9f02787578cbf79`
- Local reveal vault: `~/.truthmarket/vault/11155111-0x5fd1469ed5ee5d3e68baf93693a6e88400a703ea-0x8fa04dc0762f14441a25829c21bcf27dde854bf3.json`

Observed market state after commit:

- Phase: `Voting`
- Outcome: `Unresolved`
- Commits: `1`
- Revealed yes/no: `0 / 0`
- Jury draw size: `0`
- Jurors revealed: `0`
- Total committed: `5000000000000000000`
- Total risked: `1000000000000000000`
- Distributable pool: `0`
- Treasury accrued: `0`
- Creator accrued: `0`
- Revoked slash: `0`

Frontend check:

- Local web app was restarted against the Sepolia deployment at `http://localhost:3000`.
- Browser snapshot showed `1 on-chain market` and the Sepolia market row `0x5FD1...03EA`.

