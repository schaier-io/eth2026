import { parseAbi } from "viem";

export const truthMarketAbi = parseAbi([
  "function RISK_PERCENT() view returns (uint8)",
  "function MAX_PROTOCOL_FEE_PERCENT() view returns (uint8)",
  "function MAX_TARGET_JURY_SIZE() view returns (uint32)",
  "function MAX_TARGET_JURY_SIZE_PERCENT() view returns (uint256)",
  "function SPACE_COMPUTER_IPNS_BEACON() view returns (string)",
  "function MAX_RANDOMNESS_IPFS_ADDRESS_BYTES() view returns (uint256)",
  "function name() view returns (string)",
  "function description() view returns (string)",
  "function getTags() view returns (string[])",
  "function ipfsHash() view returns (bytes)",
  "function swarmReference() view returns (bytes)",
  "function claimRulesHash() view returns (bytes32)",
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
  "function treasury() view returns (address)",
  "function admin() view returns (address)",
  "function juryCommitter() view returns (address)",
  "function creator() view returns (address)",
  "function votingDeadline() view returns (uint64)",
  "function juryCommitDeadline() view returns (uint64)",
  "function revealDeadline() view returns (uint64)",
  "function protocolFeePercent() view returns (uint8)",
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
  "function getConfig() view returns ((address stakeToken, address treasury, address admin, address juryCommitter, address creator, string name, string description, string[] tags, bytes ipfsHash, bytes32 claimRulesHash, uint64 votingDeadline, uint64 juryCommitDeadline, uint64 revealDeadline, uint8 protocolFeePercent, uint96 minStake, uint32 targetJurySize, uint32 minCommits, uint32 maxCommits, uint32 minRevealedJurors, uint32 maxTargetJurySize, uint256 maxTargetJurySizePercent, uint256 maxTags, uint256 maxNameBytes, uint256 maxDescriptionBytes, uint256 maxTagBytes, uint256 maxIpfsHashBytes, uint8 riskPercent, uint8 maxProtocolFeePercent))",
  "function getRevealStats() view returns ((uint8 phase, uint8 outcome, uint32 commitCount, uint32 revokedCount, uint32 withdrawnCount, uint32 revealedYesCount, uint32 revealedNoCount, uint32 revealedTotalCount, uint32 juryDrawSize, uint32 juryYesCount, uint32 juryNoCount, uint32 jurorRevealCount, uint256 totalCommittedStake, uint256 totalRiskedStake, uint256 revealedYesStake, uint256 revealedNoStake, uint256 revealedYesRisked, uint256 revealedNoRisked, uint256 jurorYesStake, uint256 jurorNoStake, uint256 jurorYesRisked, uint256 jurorNoRisked, uint256 distributablePool, uint256 revokedSlashAccrued, uint256 treasuryAccrued, uint256 creatorAccrued))",
  "function getJurorVotes() view returns ((address juror, bool revealed, uint8 vote, uint96 stake, uint96 riskedStake)[])",
  "function getRandomnessEvidence() view returns ((uint256 randomness, bytes32 randomnessHash, bytes randomnessIpfsAddress, uint64 randomnessSequence, uint64 randomnessTimestamp, uint16 randomnessIndex, bytes32 juryAuditHash))",
  "function commitVote(bytes32 commitHash, uint96 stake)",
  "function revealVote(uint8 vote, bytes32 nonce)",
  "function revokeStake(address voter, uint8 vote, bytes32 nonce)",
  "function commitJury(uint256 randomness, (bytes ipfsAddress, uint64 sequence, uint64 timestamp, uint16 valueIndex) metadata, bytes32 auditHash)",
  "function resolve()",
  "function withdraw()",
  "event MarketStarted(string name, string description, string[] tags, bytes ipfsHash, bytes32 claimRulesHash, uint64 votingDeadline, uint64 juryCommitDeadline, uint64 revealDeadline, uint32 targetJurySize, uint32 minCommits, uint32 minRevealedJurors, uint96 minStake)",
  "event VoteCommitted(address indexed voter, bytes32 commitHash, uint96 stake, uint96 riskedStake)",
  "event JuryCommitted(uint256 randomness, bytes32 randomnessHash, bytes randomnessIpfsAddress, uint64 randomnessSequence, uint64 randomnessTimestamp, uint16 randomnessIndex, address[] jurors, bytes32 auditHash)",
  "event VoteRevealed(address indexed voter, uint8 vote, uint96 stake, uint96 riskedStake)",
  "event Resolved(uint8 outcome, uint32 winningJuryCount, uint256 slashedRiskedStake, uint256 protocolFee, uint256 creatorAccruedAmount, uint256 distributablePool)",
  "event Withdrawn(address indexed voter, uint256 payout)",
  "event StakeRevoked(address indexed voter, address indexed claimer, uint96 stake, uint96 claimerCut, uint96 pooledCut)",
]);

export const marketRegistryAbi = parseAbi([
  "function stakeToken() view returns (address)",
  "function markets(uint256) view returns (address)",
  "function marketCount() view returns (uint256)",
  "function getMarkets(uint256 offset, uint256 limit) view returns (address[])",
  "function createMarket((string name, string description, string[] tags, bytes ipfsHash, uint64 votingPeriod, uint64 adminTimeout, uint64 revealPeriod, uint8 protocolFeePercent, uint96 minStake, uint32 jurySize, uint32 minCommits, uint32 minRevealedJurors) spec) returns (address)",
  "event MarketCreated(uint256 indexed id, address indexed market, address indexed creator)",
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
