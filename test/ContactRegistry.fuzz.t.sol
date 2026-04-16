// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Test.sol";
import "../src/ContactRegistry.sol";

contract ContactRegistryFuzzTest is Test {
    ContactRegistry registry;

    function setUp() public {
        registry = new ContactRegistry();
    }

    function _validKey(bytes32 seed) internal pure returns (bytes memory out) {
        out = new bytes(33);
        bytes32 a = seed;
        bytes32 b = keccak256(abi.encode(seed));
        for (uint256 i = 0; i < 32; i++) {
            out[i] = a[i];
        }
        out[32] = b[0];
    }

    function _nonZeroOverlay(bytes32 seed) internal pure returns (bytes32) {
        if (seed == bytes32(0)) return keccak256("fallback-overlay");
        return seed;
    }

    function _nonEmptyName(string memory name) internal pure returns (string memory) {
        if (bytes(name).length == 0) return "x";
        if (bytes(name).length > 64) {
            bytes memory raw = bytes(name);
            bytes memory trimmed = new bytes(64);
            for (uint256 i = 0; i < 64; i++) trimmed[i] = raw[i];
            return string(trimmed);
        }
        return name;
    }

    function testFuzz_RegisterRoundTrip(address user, string memory rawName, bytes32 keySeed, bytes32 overlay)
        public
    {
        vm.assume(user != address(0));
        string memory name = _nonEmptyName(rawName);
        bytes memory key = _validKey(keySeed);
        bytes32 ov = _nonZeroOverlay(overlay);

        vm.prank(user);
        registry.register(name, key, ov);

        assertTrue(registry.isRegistered(user));
        (string memory n, bytes memory k, bytes32 o,, bool active) = registry.getProfile(user);
        assertEq(n, name);
        assertEq(keccak256(k), keccak256(key));
        assertEq(o, ov);
        assertTrue(active);
    }

    function testFuzz_RegisterRevertsOnBadNameLength(uint16 lenRaw, bytes32 keySeed, bytes32 overlay) public {
        // Only lengths in {0, 65..512} are invalid
        uint256 len = uint256(lenRaw) % 513;
        vm.assume(len == 0 || len > 64);

        bytes memory name = new bytes(len);
        bytes memory key = _validKey(keySeed);
        bytes32 ov = _nonZeroOverlay(overlay);

        vm.prank(address(0xBEEF));
        vm.expectRevert(bytes("bad name"));
        registry.register(string(name), key, ov);
    }

    function testFuzz_RegisterRevertsOnBadKeyLength(uint8 lenRaw, bytes32 overlay) public {
        uint256 len = uint256(lenRaw);
        vm.assume(len != 33);

        bytes memory key = new bytes(len);
        bytes32 ov = _nonZeroOverlay(overlay);

        vm.prank(address(0xBEEF));
        vm.expectRevert(bytes("pss key must be 33 bytes"));
        registry.register("fuzz", key, ov);
    }

    function testFuzz_UserCountOnlyGrowsOnFirstRegistration(address user, bytes32 keySeed, bytes32 overlay, uint8 reps)
        public
    {
        vm.assume(user != address(0));
        uint256 iters = uint256(reps) % 5 + 1;

        bytes memory key = _validKey(keySeed);
        bytes32 ov = _nonZeroOverlay(overlay);

        for (uint256 i = 0; i < iters; i++) {
            vm.prank(user);
            registry.register("fuzz", key, ov);
        }

        assertEq(registry.getUserCount(), 1);
    }

    function testFuzz_PaginationAlwaysInBounds(uint8 numUsers, uint256 offset, uint256 limit) public {
        uint256 n = uint256(numUsers) % 12;

        for (uint256 i = 0; i < n; i++) {
            address actor = address(uint160(uint256(keccak256(abi.encode("actor", i)))));
            vm.assume(actor != address(0));
            vm.prank(actor);
            registry.register("u", _validKey(bytes32(i)), keccak256(abi.encode("ov", i)));
        }

        // Bound limit so we don't request gigantic arrays
        limit = bound(limit, 0, 32);
        offset = bound(offset, 0, n + 5);

        address[] memory page = registry.getUsers(offset, limit);

        if (offset >= n) {
            assertEq(page.length, 0);
        } else {
            uint256 expected = offset + limit > n ? n - offset : limit;
            assertEq(page.length, expected);
        }
    }

    function testFuzz_DeactivateUnregisteredReverts(address user) public {
        vm.assume(user != address(0));
        vm.prank(user);
        vm.expectRevert(bytes("not active"));
        registry.deactivate();
    }
}
