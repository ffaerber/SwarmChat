// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title ContactRegistry
/// @notice On-chain directory of SwarmChat users. Each wallet registers a
///         profile containing a display name, a PSS public key, and a Swarm
///         overlay address so peers can discover each other and route PSS
///         messages without a central server.
contract ContactRegistry {
    struct Profile {
        string displayName;   // <= 64 chars
        bytes pssPublicKey;   // 33-byte compressed secp256k1 PSS public key
        bytes32 swarmOverlay; // 32-byte Swarm overlay address
        uint64 updatedAt;
        bool active;
    }

    mapping(address => Profile) private _profiles;
    address[] private _users;
    mapping(address => uint256) private _userIndex; // index+1, 0 = absent

    event Registered(address indexed user, string displayName);
    event Updated(address indexed user, string displayName);
    event Deactivated(address indexed user);

    function register(string calldata displayName, bytes calldata pssPublicKey, bytes32 swarmOverlay) external {
        require(bytes(displayName).length > 0 && bytes(displayName).length <= 64, "bad name");
        require(pssPublicKey.length == 33, "pss key must be 33 bytes");
        require(swarmOverlay != bytes32(0), "overlay required");

        Profile storage p = _profiles[msg.sender];
        bool isNew = _userIndex[msg.sender] == 0;

        p.displayName = displayName;
        p.pssPublicKey = pssPublicKey;
        p.swarmOverlay = swarmOverlay;
        p.updatedAt = uint64(block.timestamp);
        p.active = true;

        if (isNew) {
            _users.push(msg.sender);
            _userIndex[msg.sender] = _users.length;
            emit Registered(msg.sender, displayName);
        } else {
            emit Updated(msg.sender, displayName);
        }
    }

    function deactivate() external {
        require(_profiles[msg.sender].active, "not active");
        _profiles[msg.sender].active = false;
        emit Deactivated(msg.sender);
    }

    function isRegistered(address user) external view returns (bool) {
        return _profiles[user].active;
    }

    function getProfile(address user)
        external
        view
        returns (string memory displayName, bytes memory pssPublicKey, bytes32 swarmOverlay, uint64 updatedAt, bool active)
    {
        Profile storage p = _profiles[user];
        return (p.displayName, p.pssPublicKey, p.swarmOverlay, p.updatedAt, p.active);
    }

    function getUserCount() external view returns (uint256) {
        return _users.length;
    }

    function getUsers(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        uint256 total = _users.length;
        if (offset >= total) return new address[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = _users[i];
        }
    }
}
