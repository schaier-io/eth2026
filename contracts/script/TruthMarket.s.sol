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
        uint64 votingPeriod = _envUint64("VOTING_PERIOD");
        uint64 adminTimeout = _envUint64("ADMIN_TIMEOUT");
        uint64 revealPeriod = _envUint64("REVEAL_PERIOD");
        uint8 protocolFeePercent = _envUint8("PROTOCOL_FEE_PERCENT");
        uint96 minStake = _envUint96("MIN_STAKE");
        uint32 jurySize = _envUint32("JURY_SIZE");
        uint32 minCommits = _envUint32("MIN_COMMITS");
        uint32 minRevealedJurors = _envUint32("MIN_REVEALED_JURORS");

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
    ///      filtering out empty entries. Up to MAX_TAGS (5) entries. Returns an empty
    ///      array when CLAIM_TAGS is unset.
    function _envTags() internal view returns (string[] memory) {
        string memory raw = vm.envOr("CLAIM_TAGS", string(""));
        return _splitCsv(raw);
    }

    function _envUint8(string memory key) internal view returns (uint8) {
        uint256 value = vm.envUint(key);
        require(value <= type(uint8).max, string.concat(key, " too large"));
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint8(value);
    }

    function _envUint32(string memory key) internal view returns (uint32) {
        uint256 value = vm.envUint(key);
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
