// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { MarketRegistry } from "../src/MarketRegistry.sol";
import { TruthMarket } from "../src/TruthMarket.sol";
import { MockERC20 } from "./MockERC20.sol";

contract WrongImplementationWithVersion {
    function CONTRACT_ID() external pure returns (bytes32) {
        return keccak256("WrongImplementation");
    }

    function CONTRACT_VERSION() external pure returns (uint16) {
        return 2;
    }
}

contract MarketRegistryTest is Test {
    MarketRegistry internal registry;
    TruthMarket internal implementation;
    MockERC20 internal token;

    address internal juryCommitter = makeAddr("juryCommitter");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    bytes internal constant SWARM_REFERENCE =
        bytes("bzz://8f2b1c3d4e5f67890123456789012345678901234567890123456789012345678");

    event MarketCreated(uint256 indexed id, address indexed market, address indexed creator);
    event MarketRegistered(address indexed market, address indexed creator, uint256 indexed index, uint64 registeredAt);

    function setUp() public {
        token = new MockERC20("Truth Stake", "TRUTH", 10_000_000 ether, address(this));
        implementation = new TruthMarket();
        registry = new MarketRegistry(address(implementation));
    }

    // ---------- Constructor ----------

    function testConstructorRevertsOnZeroImplementation() public {
        vm.expectRevert(MarketRegistry.ZeroAddress.selector);
        new MarketRegistry(address(0));
    }

    function testConstructorRevertsOnNonContractImplementation() public {
        vm.expectRevert(MarketRegistry.ZeroAddress.selector);
        new MarketRegistry(makeAddr("notCode"));
    }

    function testConstructorRevertsOnWrongImplementationContract() public {
        vm.expectRevert(MarketRegistry.InvalidImplementation.selector);
        new MarketRegistry(address(token));
    }

    function testConstructorRevertsOnWrongImplementationId() public {
        WrongImplementationWithVersion wrong = new WrongImplementationWithVersion();
        vm.expectRevert(MarketRegistry.InvalidImplementation.selector);
        new MarketRegistry(address(wrong));
    }

    function testConstructorStoresImplementationAndVersions() public view {
        assertEq(registry.CONTRACT_ID(), keccak256("MarketRegistry"));
        assertEq(registry.CONTRACT_VERSION(), 2);
        assertEq(registry.implementation(), address(implementation));
        assertEq(registry.implementationVersion(), implementation.CONTRACT_VERSION());
    }

    // ---------- createMarket ----------

    function testCreateMarketClonesInitializesAndIndexes() public {
        vm.prank(alice);
        address marketAddr = registry.createMarket(_validSpec("Alice claim"));

        assertTrue(marketAddr != address(0));
        assertTrue(marketAddr != address(implementation));
        assertEq(registry.totalMarkets(), 1);
        assertEq(registry.marketCount(), 1);
        assertEq(registry.markets(0), marketAddr);
        assertTrue(registry.isRegistered(marketAddr));

        (address creator, uint64 registeredAt, uint32 index) = registry.marketInfo(marketAddr);
        assertEq(creator, alice);
        assertEq(registeredAt, uint64(block.timestamp));
        assertEq(index, 0);

        TruthMarket m = TruthMarket(marketAddr);
        assertEq(address(m.stakeToken()), address(token));
        assertEq(m.juryCommitter(), juryCommitter);
        assertEq(m.creator(), alice);
        assertEq(m.swarmReference(), SWARM_REFERENCE);
        assertEq(m.maxCommits(), 99);
        assertEq(m.creatorBond(), 7 ether);
    }

    function testCreateMarketAllowsPerCloneStakeTokenAndJuryCommitter() public {
        MockERC20 otherToken = new MockERC20("Other Stake", "OTHR", 1_000_000 ether, address(this));
        address otherJuryCommitter = makeAddr("otherJuryCommitter");
        MarketRegistry.MarketSpec memory spec = _validSpec("Per clone");
        spec.stakeToken = IERC20(address(otherToken));
        spec.juryCommitter = otherJuryCommitter;

        vm.prank(alice);
        TruthMarket m = TruthMarket(registry.createMarket(spec));

        assertEq(address(m.stakeToken()), address(otherToken));
        assertEq(m.juryCommitter(), otherJuryCommitter);
    }

    function testCreateMarketEmitsFactoryAndDiscoveryEvents() public {
        vm.expectEmit(false, true, true, true, address(registry));
        emit MarketRegistered(address(0), alice, 0, uint64(block.timestamp));
        vm.expectEmit(true, false, true, true, address(registry));
        emit MarketCreated(0, address(0), alice);

        vm.prank(alice);
        registry.createMarket(_validSpec("Events"));
    }

    function testCreateMarketIncrementsIdsAndCreatorIndexes() public {
        vm.prank(alice);
        address first = registry.createMarket(_validSpec("First"));
        vm.prank(bob);
        address second = registry.createMarket(_validSpec("Second"));

        assertEq(registry.totalMarkets(), 2);
        assertEq(registry.markets(0), first);
        assertEq(registry.markets(1), second);
        assertEq(registry.countByCreator(alice), 1);
        assertEq(registry.countByCreator(bob), 1);
        assertEq(registry.marketsByCreatorPaginated(alice, 0, 1)[0], first);
        assertEq(registry.marketsByCreatorPaginated(bob, 0, 1)[0], second);
    }

    function testCreateMarketRevertsOnBadSpec() public {
        MarketRegistry.MarketSpec memory bad = _validSpec("");

        vm.prank(alice);
        vm.expectRevert(TruthMarket.BadParams.selector);
        registry.createMarket(bad);
    }

    function testImplementationCannotBeInitializedDirectly() public {
        vm.expectRevert(TruthMarket.AlreadyInitialized.selector);
        implementation.initialize(_marketInitParams(alice, _validSpec("Nope")));
    }

    function testCloneCannotBeInitializedTwice() public {
        MarketRegistry.MarketSpec memory spec = _validSpec("Once");
        vm.prank(alice);
        address marketAddr = registry.createMarket(spec);

        vm.expectRevert(TruthMarket.AlreadyInitialized.selector);
        TruthMarket(marketAddr).initialize(_marketInitParams(alice, spec));
    }

    function testRegisterCanOnlyBeCalledDuringFactoryInitialization() public {
        vm.prank(alice);
        vm.expectRevert(MarketRegistry.NotRegisteringMarket.selector);
        registry.register(alice);
    }

    // ---------- Pagination ----------

    function testPaginatedReads() public {
        vm.startPrank(alice);
        address first = registry.createMarket(_validSpec("a"));
        address second = registry.createMarket(_validSpec("b"));
        address third = registry.createMarket(_validSpec("c"));
        vm.stopPrank();

        address[] memory page = registry.getMarkets(0, 2);
        assertEq(page.length, 2);
        assertEq(page[0], first);
        assertEq(page[1], second);

        page = registry.marketsPaginated(2, 5);
        assertEq(page.length, 1);
        assertEq(page[0], third);

        page = registry.marketsByCreatorPaginated(alice, 1, 1);
        assertEq(page.length, 1);
        assertEq(page[0], second);
    }

    // ---------- Helpers ----------

    function _validSpec(string memory name) internal view returns (MarketRegistry.MarketSpec memory spec) {
        spec = MarketRegistry.MarketSpec({
            stakeToken: IERC20(address(token)),
            juryCommitter: juryCommitter,
            swarmReference: bytes(name).length == 0 ? bytes("") : SWARM_REFERENCE,
            votingPeriod: 1 days,
            adminTimeout: 12 hours,
            revealPeriod: 1 days,
            minStake: 1 ether,
            jurySize: 1,
            minCommits: 7,
            maxCommits: 99,
            minRevealedJurors: 1,
            creatorBond: 7 ether
        });
    }

    function _marketInitParams(address creator, MarketRegistry.MarketSpec memory spec)
        internal
        view
        returns (TruthMarket.InitParams memory)
    {
        return TruthMarket.InitParams({
            stakeToken: spec.stakeToken,
            registry: registry,
            juryCommitter: spec.juryCommitter,
            creator: creator,
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
        });
    }
}
