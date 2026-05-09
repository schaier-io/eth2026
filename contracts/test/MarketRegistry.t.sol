// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MarketRegistry } from "../src/MarketRegistry.sol";
import { TruthMarket } from "../src/TruthMarket.sol";
import { TruthMarketRegistry, ITruthMarketRegistry } from "../src/TruthMarketRegistry.sol";
import { MockERC20 } from "./MockERC20.sol";

contract MarketRegistryTest is Test {
    MarketRegistry internal registry;
    TruthMarketRegistry internal discoveryRegistry;
    MockERC20 internal token;

    address internal treasury = makeAddr("treasury");
    address internal admin = makeAddr("admin");
    address internal juryCommitter = makeAddr("juryCommitter");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    event MarketCreated(uint256 indexed id, address indexed market, address indexed creator);

    function setUp() public {
        token = new MockERC20("Truth Stake", "TRUTH", 10_000_000 ether, address(this));
        discoveryRegistry = new TruthMarketRegistry();
        registry = new MarketRegistry(
            IERC20(address(token)),
            treasury,
            ITruthMarketRegistry(address(discoveryRegistry)),
            admin,
            juryCommitter
        );
    }

    // ---------- Constructor ----------

    function testConstructorRevertsOnZeroStakeToken() public {
        vm.expectRevert(MarketRegistry.ZeroAddress.selector);
        new MarketRegistry(
            IERC20(address(0)),
            treasury,
            ITruthMarketRegistry(address(discoveryRegistry)),
            admin,
            juryCommitter
        );
    }

    function testConstructorRevertsOnZeroTreasury() public {
        vm.expectRevert(MarketRegistry.ZeroAddress.selector);
        new MarketRegistry(
            IERC20(address(token)),
            address(0),
            ITruthMarketRegistry(address(discoveryRegistry)),
            admin,
            juryCommitter
        );
    }

    function testConstructorRevertsOnZeroDiscoveryRegistry() public {
        vm.expectRevert(MarketRegistry.ZeroAddress.selector);
        new MarketRegistry(
            IERC20(address(token)),
            treasury,
            ITruthMarketRegistry(address(0)),
            admin,
            juryCommitter
        );
    }

    function testConstructorRevertsOnZeroAdmin() public {
        vm.expectRevert(MarketRegistry.ZeroAddress.selector);
        new MarketRegistry(
            IERC20(address(token)),
            treasury,
            ITruthMarketRegistry(address(discoveryRegistry)),
            address(0),
            juryCommitter
        );
    }

    function testConstructorRevertsOnZeroJuryCommitter() public {
        vm.expectRevert(MarketRegistry.ZeroAddress.selector);
        new MarketRegistry(
            IERC20(address(token)),
            treasury,
            ITruthMarketRegistry(address(discoveryRegistry)),
            admin,
            address(0)
        );
    }

    function testConstructorStoresOperationalAddresses() public view {
        assertEq(address(registry.stakeToken()), address(token));
    }

    // ---------- createMarket ----------

    function testCreateMarketDeploysAndIndexes() public {
        vm.prank(alice);
        address marketAddr = registry.createMarket(_validSpec("Alice's Claim"));

        assertTrue(marketAddr != address(0));
        assertEq(registry.marketCount(), 1);
        assertEq(registry.markets(0), marketAddr);
        assertTrue(discoveryRegistry.isRegistered(marketAddr));
    }

    function testCreateMarketSetsMsgSenderAsCreator() public {
        vm.prank(alice);
        address marketAddr = registry.createMarket(_validSpec("Alice's Claim"));

        TruthMarket m = TruthMarket(marketAddr);
        assertEq(m.creator(), alice);
    }

    function testCreateMarketUsesRegistryOperationalAddresses() public {
        vm.prank(alice);
        address marketAddr = registry.createMarket(_validSpec("Alice's Claim"));

        TruthMarket m = TruthMarket(marketAddr);
        assertEq(address(m.stakeToken()), address(token));
        assertEq(m.treasury(), treasury);
        assertEq(m.admin(), admin);
        assertEq(m.juryCommitter(), juryCommitter);
    }

    function testCreateMarketEmitsEvent() public {
        // We can't predict the deployed market address before the call, so accept any.
        vm.expectEmit(true, false, true, true, address(registry));
        emit MarketCreated(0, address(0), alice);

        vm.prank(alice);
        registry.createMarket(_validSpec("Alice's Claim"));
    }

    function testCreateMarketIncrementsIdAcrossCalls() public {
        vm.prank(alice);
        registry.createMarket(_validSpec("First"));
        vm.prank(bob);
        registry.createMarket(_validSpec("Second"));

        assertEq(registry.marketCount(), 2);
        assertTrue(registry.markets(0) != registry.markets(1));
    }

    function testCreateMarketRevertsOnBadSpec() public {
        MarketRegistry.MarketSpec memory bad = _validSpec("");
        vm.prank(alice);
        vm.expectRevert(TruthMarket.BadParams.selector);
        registry.createMarket(bad);
    }

    // ---------- getMarkets pagination ----------

    function testGetMarketsPagination() public {
        vm.startPrank(alice);
        registry.createMarket(_validSpec("a"));
        registry.createMarket(_validSpec("b"));
        registry.createMarket(_validSpec("c"));
        vm.stopPrank();

        address[] memory page = registry.getMarkets(0, 2);
        assertEq(page.length, 2);
        assertEq(page[0], registry.markets(0));
        assertEq(page[1], registry.markets(1));

        page = registry.getMarkets(2, 5);
        assertEq(page.length, 1);
        assertEq(page[0], registry.markets(2));

        page = registry.getMarkets(5, 1);
        assertEq(page.length, 0);

        page = registry.getMarkets(0, 0);
        assertEq(page.length, 0);
    }

    // ---------- Helpers ----------

    function _validSpec(string memory name) internal pure returns (MarketRegistry.MarketSpec memory spec) {
        string[] memory tags = new string[](2);
        tags[0] = "demo";
        tags[1] = "test";
        spec = MarketRegistry.MarketSpec({
            name: name,
            description: "An unambiguous test claim that resolves on chain.",
            tags: tags,
            ipfsHash: bytes("ipfs://Qm-claim-doc"),
            votingPeriod: 1 days,
            adminTimeout: 12 hours,
            revealPeriod: 1 days,
            protocolFeePercent: 5,
            minStake: 1 ether,
            jurySize: 1,
            minCommits: 7,
            minRevealedJurors: 1
        });
    }
}
