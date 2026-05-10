import { isAddress, keccak256, parseAbi, toHex, type Address, type Hex } from "viem";

const configuredAddress = process.env.NEXT_PUBLIC_TRUTHMARKET_ADDRESS;

export const truthMarketAddress =
  configuredAddress && isAddress(configuredAddress) ? (configuredAddress as Address) : undefined;

/** Expected `CONTRACT_ID()` value of any TruthMarket. Use to filter foreign
 *  contracts that registered into the same registry: skip any market whose
 *  `CONTRACT_ID()` returns something else (or reverts). Static, computed once. */
export const TRUTH_MARKET_CONTRACT_ID: Hex = keccak256(toHex("TruthMarket"));

export const truthMarketAbi = parseAbi([
  "function CONTRACT_ID() view returns (bytes32)",
  "function CONTRACT_VERSION() view returns (uint16)",
  "function RISK_PERCENT() view returns (uint8)",
  "function phase() view returns (uint8)",
  "function outcome() view returns (uint8)",
  "function commitCount() view returns (uint32)",
  "function totalCommittedStake() view returns (uint256)",
  "function totalRiskedStake() view returns (uint256)",
  "function distributablePool() view returns (uint256)",
  "function targetJurySize() view returns (uint32)",
  "function minRevealedJurors() view returns (uint32)",
  "function revealedJurorCount() view returns (uint32)",
  "function juryYesCount() view returns (uint32)",
  "function juryNoCount() view returns (uint32)",
  "function randomness() view returns (uint256)",
  "function randomnessHash() view returns (bytes32)",
  "function randomnessIpfsAddress() view returns (bytes)",
  "function randomnessSequence() view returns (uint64)",
  "function randomnessTimestamp() view returns (uint64)",
  "function randomnessIndex() view returns (uint16)",
  "function juryAuditHash() view returns (bytes32)",
  "function getRandomnessEvidence() view returns ((uint256 randomness, bytes32 randomnessHash, bytes randomnessIpfsAddress, uint64 randomnessSequence, uint64 randomnessTimestamp, uint16 randomnessIndex, bytes32 juryAuditHash))",
  "function getJury() view returns (address[])",
  "function minStake() view returns (uint96)",
  "function maxCommits() view returns (uint32)",
  "function stakeToken() view returns (address)",
  "function swarmReference() view returns (bytes)",
  "function previewPayout(address voter) view returns (uint256)",
  "function commitHashOf(uint8 vote, bytes32 nonce, address voter) view returns (bytes32)",
  "function commitVote(bytes32 commitHash, uint96 stake)",
  "function postBond()",
  "function creatorBond() view returns (uint96)",
  "function bondPosted() view returns (bool)",
  "function bondInfo() view returns (uint96 amount, bool posted, address bondCreator, uint256 held)",
  "function revealVote(uint8 vote, bytes32 nonce)",
  "function commitJury(uint256 randomness, (bytes ipfsAddress, uint64 sequence, uint64 timestamp, uint16 valueIndex) metadata, bytes32 auditHash)",
  "function resolve()",
  "function withdraw()",
  "function withdrawCreator()",
  "function withdrawTreasury()",
  "function creatorAccrued() view returns (uint256)",
  "function treasuryAccrued() view returns (uint256)",
  "function creator() view returns (address)",
  "function juryCommitter() view returns (address)",
  "function votingDeadline() view returns (uint64)",
  "function juryCommitDeadline() view returns (uint64)",
  "function revealDeadline() view returns (uint64)",
  "function PROTOCOL_FEE_PERCENT() view returns (uint8)",
  "function TREASURY() view returns (address)",
]);

export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);
