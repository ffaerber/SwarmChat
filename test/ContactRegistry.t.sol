// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Test.sol";
import "../src/ContactRegistry.sol";

contract ContactRegistryTest is Test {
    ContactRegistry registry;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xC0A01);
    address dave = address(0xDA7E);

    bytes alicePss = hex"02aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899";
    bytes bobPss = hex"02112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00";
    bytes32 aliceOverlay = keccak256("alice-overlay");
    bytes32 bobOverlay = keccak256("bob-overlay");

    event Registered(address indexed user, string displayName);
    event Updated(address indexed user, string displayName);
    event Deactivated(address indexed user);

    function setUp() public {
        registry = new ContactRegistry();
    }

    // --------------------------------------------------------------------
    // register: happy path + events
    // --------------------------------------------------------------------

    function test_RegisterEmitsRegistered() public {
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit Registered(alice, "alice");
        registry.register("alice", alicePss, aliceOverlay);

        assertTrue(registry.isRegistered(alice));
        assertEq(registry.getUserCount(), 1);
    }

    function test_ReRegisterEmitsUpdated() public {
        vm.prank(alice);
        registry.register("alice", alicePss, aliceOverlay);

        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit Updated(alice, "alice-v2");
        registry.register("alice-v2", alicePss, aliceOverlay);

        assertEq(registry.getUserCount(), 1, "user not re-added");
    }

    function test_GetProfileReturnsStoredFields() public {
        vm.warp(1_700_000_000);
        vm.prank(alice);
        registry.register("alice", alicePss, aliceOverlay);

        (string memory name, bytes memory pss, bytes32 overlay, uint64 updatedAt, bool active) =
            registry.getProfile(alice);

        assertEq(name, "alice");
        assertEq(keccak256(pss), keccak256(alicePss));
        assertEq(overlay, aliceOverlay);
        assertEq(updatedAt, 1_700_000_000);
        assertTrue(active);
    }

    function test_RegisterStoresProfilePerUserIndependently() public {
        vm.prank(alice);
        registry.register("alice", alicePss, aliceOverlay);
        vm.prank(bob);
        registry.register("bob", bobPss, bobOverlay);

        (string memory aliceName,,,,) = registry.getProfile(alice);
        (string memory bobName, bytes memory bobKey, bytes32 bobOv,,) = registry.getProfile(bob);

        assertEq(aliceName, "alice");
        assertEq(bobName, "bob");
        assertEq(keccak256(bobKey), keccak256(bobPss));
        assertEq(bobOv, bobOverlay);
    }

    function test_ReRegisterRefreshesUpdatedAt() public {
        vm.warp(1_700_000_000);
        vm.prank(alice);
        registry.register("alice", alicePss, aliceOverlay);

        vm.warp(1_700_100_000);
        vm.prank(alice);
        registry.register("alice", alicePss, aliceOverlay);

        (,,, uint64 updatedAt,) = registry.getProfile(alice);
        assertEq(updatedAt, 1_700_100_000);
    }

    function test_RegisterAcceptsSingleCharName() public {
        vm.prank(alice);
        registry.register("a", alicePss, aliceOverlay);

        (string memory name,,,,) = registry.getProfile(alice);
        assertEq(name, "a");
    }

    function test_RegisterAcceptsMaxLengthName() public {
        string memory sixtyFour = "0123456789012345678901234567890123456789012345678901234567890123";
        assertEq(bytes(sixtyFour).length, 64);

        vm.prank(alice);
        registry.register(sixtyFour, alicePss, aliceOverlay);

        (string memory stored,,,,) = registry.getProfile(alice);
        assertEq(stored, sixtyFour);
    }

    // --------------------------------------------------------------------
    // register: input validation
    // --------------------------------------------------------------------

    function test_RegisterRejectsEmptyName() public {
        vm.prank(alice);
        vm.expectRevert(bytes("bad name"));
        registry.register("", alicePss, aliceOverlay);
    }

    function test_RegisterRejectsLongName() public {
        string memory tooLong = new string(65);
        vm.prank(alice);
        vm.expectRevert(bytes("bad name"));
        registry.register(tooLong, alicePss, aliceOverlay);
    }

    function test_RegisterRejectsShortPssKey() public {
        bytes memory badKey = hex"deadbeef";
        vm.prank(alice);
        vm.expectRevert(bytes("pss key must be 33 bytes"));
        registry.register("alice", badKey, aliceOverlay);
    }

    function test_RegisterRejectsLongPssKey() public {
        bytes memory badKey = new bytes(34);
        vm.prank(alice);
        vm.expectRevert(bytes("pss key must be 33 bytes"));
        registry.register("alice", badKey, aliceOverlay);
    }

    function test_RegisterRejectsEmptyPssKey() public {
        bytes memory badKey = new bytes(0);
        vm.prank(alice);
        vm.expectRevert(bytes("pss key must be 33 bytes"));
        registry.register("alice", badKey, aliceOverlay);
    }

    function test_RegisterRejectsZeroOverlay() public {
        vm.prank(alice);
        vm.expectRevert(bytes("overlay required"));
        registry.register("alice", alicePss, bytes32(0));
    }

    function test_RegisterFailureLeavesStateUntouched() public {
        vm.prank(alice);
        vm.expectRevert();
        registry.register("", alicePss, aliceOverlay);

        assertFalse(registry.isRegistered(alice));
        assertEq(registry.getUserCount(), 0);
        (string memory name,,,,) = registry.getProfile(alice);
        assertEq(bytes(name).length, 0);
    }

    // --------------------------------------------------------------------
    // deactivate
    // --------------------------------------------------------------------

    function test_DeactivateFlipsActiveFalse() public {
        vm.prank(alice);
        registry.register("alice", alicePss, aliceOverlay);

        vm.prank(alice);
        vm.expectEmit(true, false, false, false);
        emit Deactivated(alice);
        registry.deactivate();

        assertFalse(registry.isRegistered(alice));
        (,,,, bool active) = registry.getProfile(alice);
        assertFalse(active);
    }

    function test_DeactivateRequiresActive() public {
        vm.prank(alice);
        vm.expectRevert(bytes("not active"));
        registry.deactivate();
    }

    function test_DeactivateTwiceReverts() public {
        vm.startPrank(alice);
        registry.register("alice", alicePss, aliceOverlay);
        registry.deactivate();
        vm.expectRevert(bytes("not active"));
        registry.deactivate();
        vm.stopPrank();
    }

    function test_DeactivatePreservesProfileData() public {
        vm.warp(1_700_000_000);
        vm.prank(alice);
        registry.register("alice", alicePss, aliceOverlay);

        vm.prank(alice);
        registry.deactivate();

        (string memory name, bytes memory pss, bytes32 overlay, uint64 updatedAt, bool active) =
            registry.getProfile(alice);
        assertEq(name, "alice");
        assertEq(keccak256(pss), keccak256(alicePss));
        assertEq(overlay, aliceOverlay);
        assertEq(updatedAt, 1_700_000_000);
        assertFalse(active);
    }

    function test_ReactivateAfterDeactivate() public {
        vm.startPrank(alice);
        registry.register("alice", alicePss, aliceOverlay);
        registry.deactivate();
        registry.register("alice-again", alicePss, aliceOverlay);
        vm.stopPrank();

        assertTrue(registry.isRegistered(alice));
        assertEq(registry.getUserCount(), 1, "user listed once");
    }

    function test_ReRegisterAfterDeactivateEmitsUpdated() public {
        vm.prank(alice);
        registry.register("alice", alicePss, aliceOverlay);
        vm.prank(alice);
        registry.deactivate();

        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit Updated(alice, "alice-again");
        registry.register("alice-again", alicePss, aliceOverlay);
    }

    // --------------------------------------------------------------------
    // isRegistered / getProfile view semantics
    // --------------------------------------------------------------------

    function test_IsRegisteredFalseForUnknown() public view {
        assertFalse(registry.isRegistered(dave));
    }

    function test_GetProfileForUnknownReturnsDefaults() public view {
        (string memory name, bytes memory pss, bytes32 overlay, uint64 updatedAt, bool active) =
            registry.getProfile(dave);
        assertEq(bytes(name).length, 0);
        assertEq(pss.length, 0);
        assertEq(overlay, bytes32(0));
        assertEq(updatedAt, 0);
        assertFalse(active);
    }

    // --------------------------------------------------------------------
    // pagination
    // --------------------------------------------------------------------

    function test_GetUsersPagination() public {
        vm.prank(alice);
        registry.register("alice", alicePss, aliceOverlay);
        vm.prank(bob);
        registry.register("bob", bobPss, bobOverlay);
        vm.prank(carol);
        registry.register("carol", alicePss, aliceOverlay);

        address[] memory first = registry.getUsers(0, 2);
        assertEq(first.length, 2);
        assertEq(first[0], alice);
        assertEq(first[1], bob);

        address[] memory tail = registry.getUsers(2, 10);
        assertEq(tail.length, 1);
        assertEq(tail[0], carol);

        address[] memory empty = registry.getUsers(100, 10);
        assertEq(empty.length, 0);
    }

    function test_GetUsersEmptyRegistry() public view {
        address[] memory page = registry.getUsers(0, 10);
        assertEq(page.length, 0);
    }

    function test_GetUsersZeroLimit() public {
        vm.prank(alice);
        registry.register("alice", alicePss, aliceOverlay);

        address[] memory page = registry.getUsers(0, 0);
        assertEq(page.length, 0);
    }

    function test_GetUsersOffsetEqualsCount() public {
        vm.prank(alice);
        registry.register("alice", alicePss, aliceOverlay);

        address[] memory page = registry.getUsers(1, 10);
        assertEq(page.length, 0);
    }

    function test_GetUsersFullPageReturnsAll() public {
        vm.prank(alice);
        registry.register("alice", alicePss, aliceOverlay);
        vm.prank(bob);
        registry.register("bob", bobPss, bobOverlay);

        address[] memory page = registry.getUsers(0, 100);
        assertEq(page.length, 2);
        assertEq(page[0], alice);
        assertEq(page[1], bob);
    }

    function test_GetUsersDeactivatedStillListed() public {
        vm.prank(alice);
        registry.register("alice", alicePss, aliceOverlay);
        vm.prank(bob);
        registry.register("bob", bobPss, bobOverlay);

        vm.prank(alice);
        registry.deactivate();

        address[] memory page = registry.getUsers(0, 10);
        assertEq(page.length, 2, "directory keeps deactivated users");
        assertEq(page[0], alice);
        assertEq(page[1], bob);
    }

    function test_GetUsersPreservesInsertionOrder() public {
        vm.prank(bob);
        registry.register("bob", bobPss, bobOverlay);
        vm.prank(alice);
        registry.register("alice", alicePss, aliceOverlay);
        vm.prank(carol);
        registry.register("carol", alicePss, aliceOverlay);

        address[] memory page = registry.getUsers(0, 10);
        assertEq(page[0], bob);
        assertEq(page[1], alice);
        assertEq(page[2], carol);
    }

    function test_GetUserCountTracksRegistrations() public {
        assertEq(registry.getUserCount(), 0);

        vm.prank(alice);
        registry.register("alice", alicePss, aliceOverlay);
        assertEq(registry.getUserCount(), 1);

        vm.prank(bob);
        registry.register("bob", bobPss, bobOverlay);
        assertEq(registry.getUserCount(), 2);

        vm.prank(alice);
        registry.register("alice-v2", alicePss, aliceOverlay);
        assertEq(registry.getUserCount(), 2, "updates don't grow list");
    }
}
