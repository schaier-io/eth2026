// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Minimal interface a TruthMarket calls during construction to record itself.
///         The market passes its `creator` and `tags` so the registry can index them
///         without calling back into the market (which is not yet code-deployed at the
///         moment `register` runs).
interface ITruthMarketRegistry {
    function register(address creator, string[] memory tags) external;
}

/// @title TruthMarketRegistry
/// @notice Append-only directory of TruthMarket deployments with creator/tag indexes
///         and pagination. Each market self-registers from its constructor; the
///         registry records `msg.sender`, the creator address, the registration
///         timestamp, and each tag hash. Off-chain consumers verify markets by
///         reading their on-chain state — the registry is a discovery layer, not a
///         source of truth.
///
///         All list-style views are paginated. Returning unbounded arrays would
///         either OOM the caller or run past the block gas limit once the registry
///         grows past tens of thousands of markets, so the contract has no
///         `allMarkets()` / unbounded `marketsByCreator(addr)` getters at all —
///         every list read must come through a `*Paginated(offset, limit)` call.
///
///         Permission model: `register()` is permissionless and idempotent per
///         address. Any caller may register itself once; spam claims arbitrary
///         creator/tags but has no on-chain market behind it.
contract TruthMarketRegistry is ITruthMarketRegistry {
    error AlreadyRegistered();
    error ZeroCreator();

    /// @notice Per-market metadata snapshot recorded at registration time.
    struct MarketInfo {
        address creator;
        uint64 registeredAt;
        uint32 index; // position in the global `markets` array
    }

    event MarketRegistered(address indexed market, address indexed creator, uint256 indexed index, uint64 registeredAt);

    /// @notice Emitted once per tag per market. Indexed `tagHash` lets consumers
    ///         filter logs by tag without scanning every registration.
    event MarketTagged(address indexed market, bytes32 indexed tagHash, string tag);

    /// @notice Cached count of registered markets. Equal to `markets.length` and
    ///         maintained in lockstep with it inside `register`. Cached so callers
    ///         have a stable, explicitly-named O(1) read for "how big is this
    ///         registry" that is independent of any list traversal.
    uint256 public totalMarkets;

    address[] public markets;
    mapping(address => bool) public isRegistered;
    mapping(address => MarketInfo) public marketInfo;
    mapping(address => address[]) public marketsByCreator;
    mapping(bytes32 => address[]) public marketsByTagHash;

    function register(address creator, string[] memory tags) external {
        if (isRegistered[msg.sender]) revert AlreadyRegistered();
        if (creator == address(0)) revert ZeroCreator();

        isRegistered[msg.sender] = true;
        uint256 index = markets.length;
        markets.push(msg.sender);
        totalMarkets = index + 1;
        // forge-lint: disable-next-line(unsafe-typecast)
        marketInfo[msg.sender] =
            MarketInfo({ creator: creator, registeredAt: uint64(block.timestamp), index: uint32(index) });

        marketsByCreator[creator].push(msg.sender);

        for (uint256 i = 0; i < tags.length; i++) {
            bytes32 h = keccak256(bytes(tags[i]));
            marketsByTagHash[h].push(msg.sender);
            emit MarketTagged(msg.sender, h, tags[i]);
        }

        // forge-lint: disable-next-line(unsafe-typecast)
        emit MarketRegistered(msg.sender, creator, index, uint64(block.timestamp));
    }

    // ---------- Counts (O(1)) ----------

    function countByCreator(address creator) external view returns (uint256) {
        return marketsByCreator[creator].length;
    }

    function countByTag(string calldata tag) external view returns (uint256) {
        return marketsByTagHash[keccak256(bytes(tag))].length;
    }

    function countByTagHash(bytes32 tagHash) external view returns (uint256) {
        return marketsByTagHash[tagHash].length;
    }

    // ---------- Paginated lookups ----------

    /// @notice Slice of `markets` in registration order. Returns an empty array
    ///         when `offset >= totalMarkets`. `limit` is clamped to the remaining
    ///         count so callers can pass `type(uint256).max` to mean "the rest".
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

    function marketsByTagPaginated(string calldata tag, uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory page)
    {
        return _slice(marketsByTagHash[keccak256(bytes(tag))], offset, limit);
    }

    function marketsByTagHashPaginated(bytes32 tagHash, uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory page)
    {
        return _slice(marketsByTagHash[tagHash], offset, limit);
    }

    // ---------- Internal helpers ----------

    function _slice(address[] storage src, uint256 offset, uint256 limit) internal view returns (address[] memory) {
        uint256 total = src.length;
        if (offset >= total) return new address[](0);
        uint256 end = offset + limit;
        if (end < offset || end > total) end = total; // saturates on overflow
        address[] memory out = new address[](end - offset);
        for (uint256 i = 0; i < out.length; i++) {
            out[i] = src[offset + i];
        }
        return out;
    }
}
