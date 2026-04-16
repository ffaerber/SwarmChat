// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Test.sol";
import "../src/ContactRegistry.sol";

contract ContactRegistryTest is Test {
    ContactRegistry registry;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xC0A01);

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

    function test_RegisterRejectsWrongPssKeyLength() public {
        bytes memory badKey = hex"deadbeef";
        vm.prank(alice);
        vm.expectRevert(bytes("pss key must be 33 bytes"));
        registry.register("alice", badKey, aliceOverlay);
    }

    function test_RegisterRejectsZeroOverlay() public {
        vm.prank(alice);
        vm.expectRevert(bytes("overlay required"));
        registry.register("alice", alicePss, bytes32(0));
    }

    function test_DeactivateFlipsActiveFalse() public {
        vm.prank(alice);
        registry.register("alice", alicePss, aliceOverlay);

        vm.prank(alice);
        vm.expectEmit(true, false, false, false);
        emit Deactivated(alice);
        registry.deactivate();

        assertFalse(registry.isRegistered(alice));
        (, , , , bool active) = registry.getProfile(alice);
        assertFalse(active);
    }

    function test_DeactivateRequiresActive() public {
        vm.prank(alice);
        vm.expectRevert(bytes("not active"));
        registry.deactivate();
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
}
