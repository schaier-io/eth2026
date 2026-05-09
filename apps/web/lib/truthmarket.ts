import { isAddress, parseAbi, type Address } from "viem";

const configuredAddress = process.env.NEXT_PUBLIC_TRUTHMARKET_ADDRESS;

export const truthMarketAddress =
  configuredAddress && isAddress(configuredAddress) ? (configuredAddress as Address) : undefined;

export const truthMarketAbi = parseAbi([
  "function RISK_PERCENT() view returns (uint8)",
  "function name() view returns (string)",
  "function description() view returns (string)",
  "function phase() view returns (uint8)",
  "function outcome() view returns (uint8)",
  "function commitCount() view returns (uint32)",
  "function totalCommittedStake() view returns (uint256)",
  "function totalRiskedStake() view returns (uint256)",
  "function distributablePool() view returns (uint256)",
  "function jurySize() view returns (uint32)",
  "function minRevealedJurors() view returns (uint32)",
  "function revealedJurorCount() view returns (uint32)",
  "function juryYesCount() view returns (uint32)",
  "function juryNoCount() view returns (uint32)",
  "function randomness() view returns (uint256)",
  "function juryAuditHash() view returns (bytes32)",
  "function getJury() view returns (address[])",
  "function minStake() view returns (uint96)",
  "function stakeToken() view returns (address)",
  "function ipfsHash() view returns (bytes)",
  "function commitHashOf(uint8 vote, bytes32 nonce, address voter) view returns (bytes32)",
  "function commitVote(bytes32 commitHash, uint96 stake)",
  "function revealVote(uint8 vote, bytes32 nonce)",
  "function withdraw()",
]);

export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);
