// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { TruthMarket } from "./TruthMarket.sol";

/// @title MarketRegistry
/// @notice Deploys `TruthMarket` instances on demand and tracks them. Operational
///         addresses (stake token, company treasury, admin, jury committer) are
///         baked in at registry deployment so a creator only supplies the topic-
///         specific configuration. The caller of `createMarket` becomes the
///         market's `creator` (entitled to the Invalid-route juror penalty).
///
///         The registry is permissionless: any address may call `createMarket`.
///         Treasury routing is registry-wide so all markets created through the
///         registry funnel protocol fees and dust to the same `companyTreasury`.
contract MarketRegistry {
    /// @notice Stake token used by every market created through this registry.
    IERC20 public immutable stakeToken;
    /// @notice Treasury address baked into every market deployed here.
    address public immutable companyTreasury;
    /// @notice Admin address shared across deployed markets.
    address public immutable admin;
    /// @notice Jury committer address shared across deployed markets.
    address public immutable juryCommitter;

    /// @notice Append-only log of deployed market addresses, in creation order.
    address[] public markets;

    /// @notice Per-market spec the caller supplies. Every field that varies by
    ///         topic or timing belongs here; everything operationally fixed for
    ///         the deploying organization is read from the registry.
    struct MarketSpec {
        string name;
        string description;
        string[] tags;
        bytes ipfsHash;
        uint64 votingPeriod;
        uint64 adminTimeout;
        uint64 revealPeriod;
        uint8 protocolFeePercent;
        uint96 minStake;
        uint32 jurySize;
        uint32 minCommits;
        uint32 minRevealedJurors;
    }

    event MarketCreated(
        uint256 indexed id,
        address indexed market,
        address indexed creator,
        string name,
        bytes ipfsHash
    );

    error ZeroAddress();

    constructor(IERC20 _stakeToken, address _companyTreasury, address _admin, address _juryCommitter) {
        if (address(_stakeToken) == address(0)) revert ZeroAddress();
        if (_companyTreasury == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();
        if (_juryCommitter == address(0)) revert ZeroAddress();

        stakeToken = _stakeToken;
        companyTreasury = _companyTreasury;
        admin = _admin;
        juryCommitter = _juryCommitter;
    }

    /// @notice Deploy a new TruthMarket. Reverts (via TruthMarket) if any spec
    ///         field violates its on-chain bounds.
    function createMarket(MarketSpec calldata spec) external returns (address market) {
        TruthMarket m = new TruthMarket(
            TruthMarket.InitParams({
                stakeToken: stakeToken,
                treasury: companyTreasury,
                admin: admin,
                juryCommitter: juryCommitter,
                creator: msg.sender,
                name: spec.name,
                description: spec.description,
                tags: spec.tags,
                ipfsHash: spec.ipfsHash,
                votingPeriod: spec.votingPeriod,
                adminTimeout: spec.adminTimeout,
                revealPeriod: spec.revealPeriod,
                protocolFeePercent: spec.protocolFeePercent,
                minStake: spec.minStake,
                jurySize: spec.jurySize,
                minCommits: spec.minCommits,
                minRevealedJurors: spec.minRevealedJurors
            })
        );
        market = address(m);
        uint256 id = markets.length;
        markets.push(market);
        emit MarketCreated(id, market, msg.sender, spec.name, spec.ipfsHash);
    }

    function marketCount() external view returns (uint256) {
        return markets.length;
    }

    /// @notice Paginated read of deployed market addresses.
    function getMarkets(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        uint256 total = markets.length;
        if (offset >= total || limit == 0) return new address[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        page = new address[](end - offset);
        for (uint256 i = 0; i < page.length; i++) {
            page[i] = markets[offset + i];
        }
    }
}
