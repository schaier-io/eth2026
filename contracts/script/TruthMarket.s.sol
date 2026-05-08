// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console2 } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { TruthMarket } from "../src/TruthMarket.sol";

/// @notice Deploy a TruthMarket with its full configuration baked in at construction.
contract TruthMarketScript is Script {
    function run() external returns (TruthMarket market) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address stakeToken = vm.envAddress("STAKE_TOKEN");
        address treasury = vm.envOr("TREASURY", deployer);
        address admin = vm.envOr("ADMIN", deployer);
        address juryCommitter = vm.envOr("JURY_COMMITTER", deployer);
        address creator = vm.envOr("CREATOR", deployer);
        string memory name = vm.envString("CLAIM_NAME");
        string memory description = vm.envString("CLAIM_DESCRIPTION");
        string[] memory tags = _envTags();
        bytes memory ipfsHash = vm.envBytes("IPFS_HASH");
        uint64 votingPeriod = uint64(vm.envUint("VOTING_PERIOD"));
        uint64 adminTimeout = uint64(vm.envUint("ADMIN_TIMEOUT"));
        uint64 revealPeriod = uint64(vm.envUint("REVEAL_PERIOD"));
        uint8 protocolFeePercent = uint8(vm.envUint("PROTOCOL_FEE_PERCENT"));
        uint96 minStake = uint96(vm.envUint("MIN_STAKE"));
        uint32 jurySize = uint32(vm.envUint("JURY_SIZE"));
        uint32 minCommits = uint32(vm.envUint("MIN_COMMITS"));
        uint32 minRevealedJurors = uint32(vm.envUint("MIN_REVEALED_JURORS"));

        vm.startBroadcast(pk);
        market = new TruthMarket(
            TruthMarket.InitParams({
                stakeToken: IERC20(stakeToken),
                treasury: treasury,
                admin: admin,
                juryCommitter: juryCommitter,
                creator: creator,
                name: name,
                description: description,
                tags: tags,
                ipfsHash: ipfsHash,
                votingPeriod: votingPeriod,
                adminTimeout: adminTimeout,
                revealPeriod: revealPeriod,
                protocolFeePercent: protocolFeePercent,
                minStake: minStake,
                jurySize: jurySize,
                minCommits: minCommits,
                minRevealedJurors: minRevealedJurors
            })
        );
        vm.stopBroadcast();

        console2.log("TruthMarket deployed at:", address(market));
        console2.log("Stake token:   ", stakeToken);
        console2.log("Treasury:      ", treasury);
        console2.log("Admin:         ", admin);
        console2.log("Jury committer:", juryCommitter);
        console2.log("Creator:       ", creator);
        console2.log("Name:          ", name);
        console2.log("Tags count:    ", tags.length);
    }

    /// @dev Reads CLAIM_TAGS as a comma-separated string (e.g. "demo,test,prediction"),
    ///      filtering out empty entries. Up to MAX_TAGS (5) entries.
    function _envTags() internal view returns (string[] memory) {
        string memory raw;
        try this.readEnvString("CLAIM_TAGS") returns (string memory v) {
            raw = v;
        } catch {
            return new string[](0);
        }
        return _splitCsv(raw);
    }

    function readEnvString(string calldata key) external view returns (string memory) {
        return vm.envString(key);
    }

    function _splitCsv(string memory s) internal pure returns (string[] memory) {
        bytes memory b = bytes(s);
        if (b.length == 0) return new string[](0);

        // First pass: count non-empty entries.
        uint256 count = 1;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == ",") count++;
        }
        string[] memory parts = new string[](count);

        uint256 partIdx;
        uint256 start;
        for (uint256 i = 0; i <= b.length; i++) {
            if (i == b.length || b[i] == ",") {
                bytes memory piece = new bytes(i - start);
                for (uint256 j = 0; j < piece.length; j++) piece[j] = b[start + j];
                parts[partIdx++] = string(piece);
                start = i + 1;
            }
        }

        // Filter empties.
        uint256 nonEmpty;
        for (uint256 i = 0; i < parts.length; i++) {
            if (bytes(parts[i]).length > 0) nonEmpty++;
        }
        string[] memory out = new string[](nonEmpty);
        uint256 oi;
        for (uint256 i = 0; i < parts.length; i++) {
            if (bytes(parts[i]).length > 0) out[oi++] = parts[i];
        }
        return out;
    }
}
