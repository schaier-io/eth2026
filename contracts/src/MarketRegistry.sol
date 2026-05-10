// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";

import { TruthMarket } from "./TruthMarket.sol";
import { ITruthMarketRegistry } from "./TruthMarketRegistry.sol";

/// @title MarketRegistry
/// @notice Clone factory plus append-only discovery index for TruthMarket markets.
///         The expensive TruthMarket bytecode is deployed once as `implementation`;
///         every market created through this registry is an EIP-1167 minimal clone
///         initialized with topic-specific parameters.
///
///         A creator supplies the per-clone stake token, jury committer,
///         Swarm claim/rules reference, and timing/stake bounds. `msg.sender` becomes the
///         market creator. The registry itself is passed into the clone as the
///         `ITruthMarketRegistry`, so clone initialization and discovery indexing
///         stay atomic.
contract MarketRegistry is ITruthMarketRegistry {
    /// @notice Contract-family identifier for indexers and clients.
    bytes32 public constant CONTRACT_ID = keccak256("MarketRegistry");
    /// @notice Registry ABI/storage version. Bump on breaking registry changes.
    uint16 public constant CONTRACT_VERSION = 1;

    /// @notice TruthMarket implementation cloned by `createMarket`.
    address public immutable implementation;
    /// @notice TruthMarket implementation version recorded at registry deployment.
    uint16 public immutable implementationVersion;

    /// @notice Append-only count of registered clone markets.
    uint256 public totalMarkets;

    address[] public markets;
    mapping(address => bool) public isRegistered;
    mapping(address => MarketInfo) public marketInfo;
    mapping(address => address[]) public marketsByCreator;

    address private _registeringMarket;

    /// @notice Per-market metadata snapshot recorded at registration time.
    struct MarketInfo {
        address creator;
        uint64 registeredAt;
        uint32 index;
    }

    /// @notice Per-market spec the caller supplies. Every value that should vary
    ///         by market lives here; only the implementation address is shared.
    struct MarketSpec {
        IERC20 stakeToken;
        address juryCommitter;
        bytes swarmReference;
        uint64 votingPeriod;
        uint64 adminTimeout;
        uint64 revealPeriod;
        uint96 minStake;
        uint32 jurySize;
        uint32 minCommits;
        uint32 maxCommits;
        uint32 minRevealedJurors;
        uint96 creatorBond;
    }

    event MarketCreated(uint256 indexed id, address indexed market, address indexed creator);
    event MarketRegistered(address indexed market, address indexed creator, uint256 indexed index, uint64 registeredAt);

    error ZeroAddress();
    error NotRegisteringMarket();
    error AlreadyRegistered();
    error ZeroCreator();
    error MarketLimitReached();
    error InvalidImplementation();

    constructor(address _implementation) {
        if (_implementation == address(0)) revert ZeroAddress();
        if (_implementation.code.length == 0) revert ZeroAddress();

        implementation = _implementation;
        try TruthMarket(_implementation).CONTRACT_ID() returns (bytes32 id) {
            if (id != keccak256("TruthMarket")) revert InvalidImplementation();
        } catch {
            revert InvalidImplementation();
        }
        try TruthMarket(_implementation).CONTRACT_VERSION() returns (uint16 version) {
            implementationVersion = version;
        } catch {
            revert InvalidImplementation();
        }
    }

    /// @notice Create and initialize a new TruthMarket clone. Reverts via
    ///         TruthMarket if any spec field violates market bounds.
    function createMarket(MarketSpec calldata spec) external returns (address market) {
        market = Clones.clone(implementation);
        uint256 id = markets.length;

        _registeringMarket = market;
        TruthMarket(market)
            .initialize(
                TruthMarket.InitParams({
                stakeToken: spec.stakeToken,
                registry: ITruthMarketRegistry(address(this)),
                juryCommitter: spec.juryCommitter,
                creator: msg.sender,
                swarmReference: spec.swarmReference,
                votingPeriod: spec.votingPeriod,
                adminTimeout: spec.adminTimeout,
                revealPeriod: spec.revealPeriod,
                minStake: spec.minStake,
                targetJurySize: spec.jurySize,
                minCommits: spec.minCommits,
                maxCommits: spec.maxCommits,
                minRevealedJurors: spec.minRevealedJurors,
                creatorBond: spec.creatorBond
            })
            );
        _registeringMarket = address(0);

        emit MarketCreated(id, market, msg.sender);
    }

    /// @notice Called by a freshly cloned market during `initialize`.
    function register(address creator) external override {
        if (msg.sender != _registeringMarket) revert NotRegisteringMarket();
        if (isRegistered[msg.sender]) revert AlreadyRegistered();
        if (creator == address(0)) revert ZeroCreator();

        uint256 index = markets.length;
        if (index > type(uint32).max) revert MarketLimitReached();

        isRegistered[msg.sender] = true;
        markets.push(msg.sender);
        totalMarkets = index + 1;
        // forge-lint: disable-next-line(unsafe-typecast)
        marketInfo[msg.sender] =
            MarketInfo({ creator: creator, registeredAt: uint64(block.timestamp), index: uint32(index) });

        marketsByCreator[creator].push(msg.sender);

        // forge-lint: disable-next-line(unsafe-typecast)
        emit MarketRegistered(msg.sender, creator, index, uint64(block.timestamp));
    }

    // ---------- Counts (O(1)) ----------

    function marketCount() external view returns (uint256) {
        return totalMarkets;
    }

    function countByCreator(address creator) external view returns (uint256) {
        return marketsByCreator[creator].length;
    }

    // ---------- Paginated lookups ----------

    function getMarkets(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        return _slice(markets, offset, limit);
    }

    function marketsPaginated(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        return _slice(markets, offset, limit);
    }

    function marketsByCreatorPaginated(address creator, uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory page)
    {
        return _slice(marketsByCreator[creator], offset, limit);
    }

    function _slice(address[] storage src, uint256 offset, uint256 limit) internal view returns (address[] memory) {
        uint256 total = src.length;
        if (offset >= total) return new address[](0);
        uint256 end = offset + limit;
        if (end < offset || end > total) end = total;
        address[] memory out = new address[](end - offset);
        for (uint256 i = 0; i < out.length; i++) {
            out[i] = src[offset + i];
        }
        return out;
    }
}
