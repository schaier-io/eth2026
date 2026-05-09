// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console2 } from "forge-std/Script.sol";
import { TruthMarket } from "../src/TruthMarket.sol";
import { TruthMarketRegistry } from "../src/TruthMarketRegistry.sol";

/// @notice Read-only enumeration of registered markets. Each entry point is a
///         separate `--sig` so callers can pick the view they want without
///         rebuilding the script.
///
///         Every list view in the registry is paginated to avoid OOM/gas-bombs
///         once the registry grows. `listAll`, `listByCreator`, and `listByTag`
///         iterate in `PAGE_SIZE` chunks until exhausted; `listPaginated` is the
///         single-page form for callers who only want a slice.
///
/// Required env: `REGISTRY_ADDRESS` — the deployed `TruthMarketRegistry`.
/// Optional env (per sig): `CREATOR`, `TAG`, `OFFSET`, `LIMIT`, `MARKET`,
///                         `PAGE_SIZE` (default 200).
contract RegistryScript is Script {
    /// @dev Default chunk size for the streaming list views. Override with
    ///      `PAGE_SIZE` env var if you want bigger or smaller pages.
    uint256 internal constant DEFAULT_PAGE_SIZE = 200;

    function listAll() external view {
        TruthMarketRegistry registry = _registry();
        uint256 total = registry.totalMarkets();
        uint256 pageSize = _pageSize();
        console2.log("Registry:     ", address(registry));
        console2.log("Total markets:", total);
        console2.log("Page size:    ", pageSize);
        console2.log("");

        uint256 cursor = 0;
        while (cursor < total) {
            address[] memory page = registry.marketsPaginated(cursor, pageSize);
            for (uint256 i = 0; i < page.length; i++) {
                _logFromInfo(registry, cursor + i, page[i]);
            }
            if (page.length == 0) break;
            cursor += page.length;
        }
    }

    function listByCreator() external view {
        TruthMarketRegistry registry = _registry();
        address creator = vm.envAddress("CREATOR");
        uint256 total = registry.countByCreator(creator);
        uint256 pageSize = _pageSize();
        console2.log("Registry:", address(registry));
        console2.log("Creator: ", creator);
        console2.log("Markets: ", total);
        console2.log("");

        uint256 cursor = 0;
        while (cursor < total) {
            address[] memory page = registry.marketsByCreatorPaginated(creator, cursor, pageSize);
            for (uint256 i = 0; i < page.length; i++) {
                _logFromInfo(registry, cursor + i, page[i]);
            }
            if (page.length == 0) break;
            cursor += page.length;
        }
    }

    function listByTag() external view {
        TruthMarketRegistry registry = _registry();
        string memory tag = vm.envString("TAG");
        uint256 total = registry.countByTag(tag);
        uint256 pageSize = _pageSize();
        console2.log("Registry:", address(registry));
        console2.log("Tag:     ", tag);
        console2.log("Markets: ", total);
        console2.log("");

        uint256 cursor = 0;
        while (cursor < total) {
            address[] memory page = registry.marketsByTagPaginated(tag, cursor, pageSize);
            for (uint256 i = 0; i < page.length; i++) {
                _logFromInfo(registry, cursor + i, page[i]);
            }
            if (page.length == 0) break;
            cursor += page.length;
        }
    }

    function listPaginated() external view {
        TruthMarketRegistry registry = _registry();
        uint256 offset = vm.envOr("OFFSET", uint256(0));
        uint256 limit = vm.envOr("LIMIT", uint256(50));
        address[] memory page = registry.marketsPaginated(offset, limit);
        console2.log("Registry:", address(registry));
        console2.log("Offset:  ", offset);
        console2.log("Limit:   ", limit);
        console2.log("Returned:", page.length);
        console2.log("Total:   ", registry.totalMarkets());
        console2.log("");

        for (uint256 i = 0; i < page.length; i++) {
            _logFromInfo(registry, offset + i, page[i]);
        }
    }

    /// @notice Detailed read for a single market: registry metadata plus on-chain
    ///         claim metadata fetched directly from the market.
    function info() external view {
        TruthMarketRegistry registry = _registry();
        address marketAddr = vm.envAddress("MARKET");

        require(registry.isRegistered(marketAddr), "market not registered");
        (address creator, uint64 registeredAt, uint32 index) = registry.marketInfo(marketAddr);
        TruthMarket m = TruthMarket(marketAddr);

        console2.log("Registry:        ", address(registry));
        console2.log("Market:          ", marketAddr);
        console2.log("Index:           ", index);
        console2.log("Creator:         ", creator);
        console2.log("Registered at:   ", registeredAt);
        console2.log("");
        console2.log("Name:            ", m.name());
        console2.log("Description:     ", m.description());
        string[] memory tags = m.getTags();
        console2.log("Tag count:       ", tags.length);
        for (uint256 i = 0; i < tags.length; i++) {
            console2.log("  tag:           ", tags[i]);
        }
        console2.log("");
        console2.log("Phase (enum):    ", uint256(m.phase()));
        console2.log("Voting deadline: ", m.votingDeadline());
        console2.log("Jury deadline:   ", m.juryCommitDeadline());
        console2.log("Reveal deadline: ", m.revealDeadline());
        console2.log("Min stake:       ", m.minStake());
        console2.log("Min commits:     ", m.minCommits());
        console2.log("Max commits:     ", m.maxCommits());
        console2.log("Target jury size:", m.targetJurySize());
        console2.log("Commit count:    ", m.commitCount());
    }

    // ---------- Internal helpers ----------

    function _registry() internal view returns (TruthMarketRegistry) {
        return TruthMarketRegistry(vm.envAddress("REGISTRY_ADDRESS"));
    }

    function _pageSize() internal view returns (uint256) {
        return vm.envOr("PAGE_SIZE", DEFAULT_PAGE_SIZE);
    }

    function _logFromInfo(TruthMarketRegistry registry, uint256 i, address market) internal view {
        (address creator, uint64 registeredAt, uint32 index) = registry.marketInfo(market);
        console2.log("[", i, "] market: ", market);
        console2.log("      creator:", creator);
        console2.log("      idx:    ", index);
        console2.log("      ts:     ", registeredAt);
    }
}
