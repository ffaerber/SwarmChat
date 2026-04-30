// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "forge-std/Test.sol";
import "../src/ContactRegistry.sol";

/// @dev Drives the registry with randomized register/deactivate calls from a
///      bounded actor set so invariants can be checked across arbitrary
///      sequences.
contract ContactRegistryHandler is Test {
    ContactRegistry public registry;
    address[] public actors;
    mapping(address => bool) public seen;

    constructor(ContactRegistry _registry) {
        registry = _registry;
        actors.push(address(0xA1));
        actors.push(address(0xA2));
        actors.push(address(0xA3));
        actors.push(address(0xA4));
        actors.push(address(0xA5));
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function seenCount() external view returns (uint256 n) {
        for (uint256 i = 0; i < actors.length; i++) {
            if (seen[actors[i]]) n++;
        }
    }

    function _pick(uint256 actorSeed) internal view returns (address) {
        return actors[actorSeed % actors.length];
    }

    function _key(bytes32 seed) internal pure returns (bytes memory out) {
        out = new bytes(33);
        bytes32 a = seed;
        for (uint256 i = 0; i < 32; i++) out[i] = a[i];
        out[32] = bytes1(uint8(uint256(seed) & 0xff));
    }

    function register(uint256 actorSeed, bytes32 keySeed, bytes32 overlaySeed, uint8 nameLen) external {
        address actor = _pick(actorSeed);
        uint256 len = (uint256(nameLen) % 64) + 1; // 1..64
        bytes memory name = new bytes(len);
        for (uint256 i = 0; i < len; i++) name[i] = 0x61; // 'a'
        bytes32 ov = overlaySeed == bytes32(0) ? keccak256("ov") : overlaySeed;

        vm.prank(actor);
        registry.register(string(name), _key(keySeed), ov);
        seen[actor] = true;
    }

    function deactivate(uint256 actorSeed) external {
        address actor = _pick(actorSeed);
        if (!registry.isRegistered(actor)) return; // no-op instead of revert
        vm.prank(actor);
        registry.deactivate();
    }
}

contract ContactRegistryInvariantTest is Test {
    ContactRegistry registry;
    ContactRegistryHandler handler;

    function setUp() public {
        registry = new ContactRegistry();
        handler = new ContactRegistryHandler(registry);

        targetContract(address(handler));

        bytes4[] memory selectors = new bytes4[](2);
        selectors[0] = ContactRegistryHandler.register.selector;
        selectors[1] = ContactRegistryHandler.deactivate.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    /// @dev getUserCount must equal the number of distinct addresses that have
    ///      ever called register successfully.
    function invariant_UserCountMatchesDistinctRegistrants() public view {
        assertEq(registry.getUserCount(), handler.seenCount());
    }

    /// @dev The full pagination window returns exactly getUserCount addresses
    ///      and they must all be distinct.
    function invariant_UsersListHasNoDuplicates() public view {
        uint256 total = registry.getUserCount();
        address[] memory page = registry.getUsers(0, total + 10);
        assertEq(page.length, total);

        for (uint256 i = 0; i < page.length; i++) {
            for (uint256 j = i + 1; j < page.length; j++) {
                assertTrue(page[i] != page[j], "duplicate user in list");
            }
        }
    }

    /// @dev Pagination never exceeds the requested limit and never overruns
    ///      the array.
    function invariant_PaginationStaysInBounds() public view {
        uint256 total = registry.getUserCount();
        address[] memory first = registry.getUsers(0, 2);
        assertLe(first.length, 2);
        assertLe(first.length, total);

        address[] memory past = registry.getUsers(total, 5);
        assertEq(past.length, 0);
    }
}
