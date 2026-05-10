// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console2 } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MarketRegistry } from "../src/MarketRegistry.sol";
import { TruthMarket } from "../src/TruthMarket.sol";

/// @notice Create a TruthMarket clone through a deployed MarketRegistry.
contract TruthMarketScript is Script {
    function run() external returns (TruthMarket market) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address registry = vm.envAddress("REGISTRY_ADDRESS");
        require(registry.code.length > 0, "registry not deployed");
        address stakeToken = vm.envAddress("STAKE_TOKEN");
        address juryCommitter = vm.envOr("JURY_COMMITTER", deployer);
        bytes memory swarmReference = vm.envBytes("SWARM_REFERENCE");
        uint64 votingPeriod = _envUint64("VOTING_PERIOD");
        uint64 adminTimeout = _envUint64("ADMIN_TIMEOUT");
        uint64 revealPeriod = _envUint64("REVEAL_PERIOD");
        uint96 minStake = _envUint96("MIN_STAKE");
        uint32 targetJurySize = _envUint32("TARGET_JURY_SIZE");
        uint32 minCommits = _envUint32("MIN_COMMITS");
        uint32 maxCommits = _envOrUint32("MAX_COMMITS", 0);
        uint32 minRevealedJurors = _envUint32("MIN_REVEALED_JURORS");
        uint96 creatorBond = _envOrUint96("CREATOR_BOND", 0);

        vm.startBroadcast(pk);
        market = TruthMarket(
            MarketRegistry(registry)
                .createMarket(
                    MarketRegistry.MarketSpec({
                    stakeToken: IERC20(stakeToken),
                    juryCommitter: juryCommitter,
                    swarmReference: swarmReference,
                    votingPeriod: votingPeriod,
                    adminTimeout: adminTimeout,
                    revealPeriod: revealPeriod,
                    minStake: minStake,
                    jurySize: targetJurySize,
                    minCommits: minCommits,
                    maxCommits: maxCommits,
                    minRevealedJurors: minRevealedJurors,
                    creatorBond: creatorBond
                })
                )
        );
        vm.stopBroadcast();

        console2.log("TruthMarket clone created at:", address(market));
        console2.log("Registry:                ", registry);
        console2.log("Implementation:          ", MarketRegistry(registry).implementation());
        console2.log("Stake token:             ", stakeToken);
        console2.log("Jury committer:          ", juryCommitter);
        console2.log("Creator:                 ", deployer);
        console2.log("Swarm reference bytes:   ", swarmReference.length);
    }

    function _envUint32(string memory key) internal view returns (uint32) {
        uint256 value = vm.envUint(key);
        require(value <= type(uint32).max, string.concat(key, " too large"));
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint32(value);
    }

    function _envOrUint32(string memory key, uint32 fallbackValue) internal view returns (uint32) {
        uint256 value = vm.envOr(key, uint256(fallbackValue));
        require(value <= type(uint32).max, string.concat(key, " too large"));
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint32(value);
    }

    function _envUint64(string memory key) internal view returns (uint64) {
        uint256 value = vm.envUint(key);
        require(value <= type(uint64).max, string.concat(key, " too large"));
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint64(value);
    }

    function _envUint96(string memory key) internal view returns (uint96) {
        uint256 value = vm.envUint(key);
        require(value <= type(uint96).max, string.concat(key, " too large"));
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint96(value);
    }

    function _envOrUint96(string memory key, uint96 fallbackValue) internal view returns (uint96) {
        uint256 value = vm.envOr(key, uint256(fallbackValue));
        require(value <= type(uint96).max, string.concat(key, " too large"));
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint96(value);
    }
}
