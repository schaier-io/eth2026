import { parseAbi } from "viem";

export const truthMarketAbi = parseAbi([
  "function CONTRACT_ID() view returns (bytes32)",
  "function CONTRACT_VERSION() view returns (uint16)",
  "function RISK_PERCENT() view returns (uint8)",
  "function MAX_TARGET_JURY_SIZE() view returns (uint32)",
  "function MAX_TARGET_JURY_SIZE_PERCENT() view returns (uint256)",
  "function SPACE_COMPUTER_IPNS_BEACON() view returns (string)",
  "function MAX_RANDOMNESS_IPFS_ADDRESS_BYTES() view returns (uint256)",
  "function swarmReference() view returns (bytes)",
  "function previewPayout(address voter) view returns (uint256)",
  "function phase() view returns (uint8)",
  "function outcome() view returns (uint8)",
  "function commitCount() view returns (uint32)",
  "function revokedCount() view returns (uint32)",
  "function withdrawnCount() view returns (uint32)",
  "function revealedJurorCount() view returns (uint32)",
  "function revealedYesCount() view returns (uint32)",
  "function revealedNoCount() view returns (uint32)",
  "function juryYesCount() view returns (uint32)",
  "function juryNoCount() view returns (uint32)",
  "function totalCommittedStake() view returns (uint256)",
  "function totalRiskedStake() view returns (uint256)",
  "function distributablePool() view returns (uint256)",
  "function targetJurySize() view returns (uint32)",
  "function minCommits() view returns (uint32)",
  "function maxCommits() view returns (uint32)",
  "function minRevealedJurors() view returns (uint32)",
  "function minStake() view returns (uint96)",
  "function stakeToken() view returns (address)",
  "function TREASURY() view returns (address)",
  "function PROTOCOL_FEE_PERCENT() view returns (uint8)",
  "function juryCommitter() view returns (address)",
  "function creator() view returns (address)",
  "function votingDeadline() view returns (uint64)",
  "function juryCommitDeadline() view returns (uint64)",
  "function revealDeadline() view returns (uint64)",
  "function randomness() view returns (uint256)",
  "function randomnessHash() view returns (bytes32)",
  "function randomnessIpfsAddress() view returns (bytes)",
  "function randomnessSequence() view returns (uint64)",
  "function randomnessTimestamp() view returns (uint64)",
  "function randomnessIndex() view returns (uint16)",
  "function juryAuditHash() view returns (bytes32)",
  "function getJury() view returns (address[])",
  "function commits(address) view returns (bytes32 hash, uint96 stake, uint96 riskedStake, uint32 committerIndex, uint8 revealedVote, bool revealed, bool withdrawn, bool revoked)",
  "function commitHashOf(uint8 vote, bytes32 nonce, address voter) view returns (bytes32)",
  "function getConfig() view returns ((address stakeToken, address treasury, address juryCommitter, address creator, bytes swarmReference, uint64 votingDeadline, uint64 juryCommitDeadline, uint64 revealDeadline, uint8 protocolFeePercent, uint96 minStake, uint96 creatorBond, bool bondPosted, uint32 targetJurySize, uint32 minCommits, uint32 maxCommits, uint32 minRevealedJurors, uint32 maxTargetJurySize, uint256 maxTargetJurySizePercent, uint256 maxSwarmReferenceBytes, uint8 riskPercent))",
  "function getRevealStats() view returns ((uint8 phase, uint8 outcome, uint32 commitCount, uint32 revokedCount, uint32 withdrawnCount, uint32 revealedYesCount, uint32 revealedNoCount, uint32 revealedTotalCount, uint32 juryDrawSize, uint32 juryYesCount, uint32 juryNoCount, uint32 jurorRevealCount, uint256 totalCommittedStake, uint256 totalRiskedStake, uint256 revealedYesStake, uint256 revealedNoStake, uint256 revealedYesRisked, uint256 revealedNoRisked, uint256 jurorYesStake, uint256 jurorNoStake, uint256 jurorYesRisked, uint256 jurorNoRisked, uint256 distributablePool, uint256 revokedSlashAccrued, uint256 treasuryAccrued, uint256 creatorAccrued))",
  "function getJurorVotes() view returns ((address juror, bool revealed, uint8 vote, uint96 stake, uint96 riskedStake)[])",
  "function getRandomnessEvidence() view returns ((uint256 randomness, bytes32 randomnessHash, bytes randomnessIpfsAddress, uint64 randomnessSequence, uint64 randomnessTimestamp, uint16 randomnessIndex, bytes32 juryAuditHash))",
  "function commitVote(bytes32 commitHash, uint96 stake)",
  "function postBond()",
  "function creatorBond() view returns (uint96)",
  "function bondPosted() view returns (bool)",
  "function bondInfo() view returns (uint96 amount, bool posted, address bondCreator, uint256 held)",
  "function initialize((address stakeToken, address registry, address juryCommitter, address creator, bytes swarmReference, uint64 votingPeriod, uint64 adminTimeout, uint64 revealPeriod, uint96 minStake, uint32 targetJurySize, uint32 minCommits, uint32 maxCommits, uint32 minRevealedJurors, uint96 creatorBond) p)",
  "function revealVote(uint8 vote, bytes32 nonce)",
  "function revokeStake(address voter, uint8 vote, bytes32 nonce)",
  "function commitJury(uint256 randomness, (bytes ipfsAddress, uint64 sequence, uint64 timestamp, uint16 valueIndex) metadata, bytes32 auditHash)",
  "function resolve()",
  "function withdraw()",
  "event MarketStarted(bytes swarmReference, uint64 votingDeadline, uint64 juryCommitDeadline, uint64 revealDeadline, uint32 targetJurySize, uint32 minCommits, uint32 minRevealedJurors, uint96 minStake)",
  "event VoteCommitted(address indexed voter, bytes32 commitHash, uint96 stake, uint96 riskedStake)",
  "event JuryCommitted(uint256 randomness, bytes32 randomnessHash, bytes randomnessIpfsAddress, uint64 randomnessSequence, uint64 randomnessTimestamp, uint16 randomnessIndex, address[] jurors, bytes32 auditHash)",
  "event VoteRevealed(address indexed voter, uint8 vote, uint96 stake, uint96 riskedStake)",
  "event Resolved(uint8 outcome, uint32 winningJuryCount, uint256 slashedRiskedStake, uint256 protocolFee, uint256 creatorAccruedAmount, uint256 distributablePool)",
  "event Withdrawn(address indexed voter, uint256 payout)",
  "event StakeRevoked(address indexed voter, address indexed claimer, uint96 stake, uint96 claimerCut, uint96 pooledCut)",
]);

/**
 * MarketRegistry — EIP-1167 clone factory plus append-only discovery index.
 * `createMarket(spec)` creates a TruthMarket clone and indexes it atomically.
 */
export const truthMarketRegistryAbi = parseAbi([
  "function CONTRACT_ID() view returns (bytes32)",
  "function CONTRACT_VERSION() view returns (uint16)",
  "function implementation() view returns (address)",
  "function implementationVersion() view returns (uint16)",
  "function totalMarkets() view returns (uint256)",
  "function marketCount() view returns (uint256)",
  "function markets(uint256) view returns (address)",
  "function isRegistered(address market) view returns (bool)",
  "function marketInfo(address market) view returns (address creator, uint64 registeredAt, uint32 index)",
  "function countByCreator(address creator) view returns (uint256)",
  "function marketsPaginated(uint256 offset, uint256 limit) view returns (address[])",
  "function marketsByCreatorPaginated(address creator, uint256 offset, uint256 limit) view returns (address[])",
  "function getMarkets(uint256 offset, uint256 limit) view returns (address[])",
  "function createMarket((address stakeToken, address juryCommitter, bytes swarmReference, uint64 votingPeriod, uint64 adminTimeout, uint64 revealPeriod, uint96 minStake, uint32 jurySize, uint32 minCommits, uint32 maxCommits, uint32 minRevealedJurors, uint96 creatorBond) spec) returns (address)",
  "function register(address creator)",
  "event MarketCreated(uint256 indexed id, address indexed market, address indexed creator)",
  "event MarketRegistered(address indexed market, address indexed creator, uint256 indexed index, uint64 registeredAt)",
]);

export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

export const PHASE_LABELS = ["Voting", "Reveal", "Resolved"] as const;
export const OUTCOME_LABELS = ["Unresolved", "Yes", "No", "Invalid"] as const;
export const VOTE_LABELS: Record<number, string> = { 0: "NotRevealed", 1: "Yes", 2: "No" };

export type PhaseNum = 0 | 1 | 2;
export type OutcomeNum = 0 | 1 | 2 | 3;
export type VoteNum = 1 | 2;

export function phaseLabel(n: number): string {
  return PHASE_LABELS[n as PhaseNum] ?? `Unknown(${n})`;
}

export function outcomeLabel(n: number): string {
  return OUTCOME_LABELS[n as OutcomeNum] ?? `Unknown(${n})`;
}

export function voteFromString(s: string): VoteNum {
  const v = s.toLowerCase();
  if (v === "yes" || v === "y" || v === "1") return 1;
  if (v === "no" || v === "n" || v === "2") return 2;
  throw new Error(`invalid vote '${s}' (expected 'yes' or 'no')`);
}
