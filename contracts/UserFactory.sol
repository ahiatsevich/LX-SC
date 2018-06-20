/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 */

pragma solidity ^0.4.21;


import "./User.sol";
import "./UserProxy.sol";
import "./adapters/MultiEventsHistoryAdapter.sol";
import "./adapters/Roles2LibraryAdapter.sol";


contract UserFactory is MultiEventsHistoryAdapter, Roles2LibraryAdapter {

    uint constant USER_FACTORY_SCOPE = 21000;
    uint constant USER_FACTORY_ROLE_IS_NOT_ALLOWED = 21000;

    event UserCreated(
        address indexed self,
        address indexed user,
        address proxy,
        address recoveryContract,
        address owner,
        uint8[] roles
    );

    /// @dev mapping(role => is allowed)
    mapping(uint8 => bool) public allowedRoles;
    mapping(uint8 => uint8) internal indexToRoles;
    uint8 internal allowedRolesCount;

    function UserFactory(address _roles2Library) Roles2LibraryAdapter(_roles2Library) public {}

    function setupEventsHistory(address _eventsHistory) auth external returns (uint) {
        require(_eventsHistory != 0x0);

        _setEventsHistory(_eventsHistory);
        return OK;
    }

    function addAllowedRoles(uint8[] _addedRoles) auth external returns (uint) {
        uint8 _allowedRolesCount = allowedRolesCount;
        for (uint _roleIdx = 0; _roleIdx < _addedRoles.length; ++_roleIdx) {
            uint8 _role = _addedRoles[_roleIdx];
            if (allowedRoles[_role]) {
                continue;
            }

            allowedRoles[_role] = true;
            _allowedRolesCount += 1;
            indexToRoles[_allowedRolesCount] = _role;
        }
        
        allowedRolesCount = _allowedRolesCount;

        return OK;
    }

    function removeAllowedRoles(uint8[] _removedRoles) auth external returns (uint) {
        uint8 _allowedRolesCount = allowedRolesCount;
        for (uint _roleIdx = 0; _roleIdx < _removedRoles.length; ++_roleIdx) {
            uint8 _role = _removedRoles[_roleIdx];
            if (!allowedRoles[_role]) {
                continue;
            }

            uint8 _allowedRoleIdx = _getRoleIndex(_role);
            if (_allowedRolesCount != _allowedRoleIdx) {
                indexToRoles[_allowedRoleIdx] = indexToRoles[_allowedRolesCount];
            }

            delete indexToRoles[_allowedRolesCount];
            delete allowedRoles[_role];
            _allowedRolesCount -= 1;
        }
        
        allowedRolesCount = _allowedRolesCount;

        return OK;
    }

    function getAllowedRoles() public view returns (uint8[] _roles) {
        _roles = new uint8[](allowedRolesCount);
        for (uint8 _roleIdx = 0; _roleIdx < _roles.length; ++_roleIdx) {
            _roles[_roleIdx] = indexToRoles[_roleIdx + 1];
        }
    }

    function createUserWithProxyAndRecovery(
        address _owner,
        address _recoveryContract,
        uint8[] _roles
    )
    public
    returns (uint) 
    {
        require(_owner != 0x0);

        for (uint _roleIdx = 0; _roleIdx < _roles.length; ++_roleIdx) {
            require(allowedRoles[_roles[_roleIdx]]);
        }

        User user = new User(_owner, _recoveryContract);
        UserProxy proxy = UserProxy(user.getUserProxy());
        _setRoles(proxy, _roles);

        UserFactory(getEventsHistory()).emitUserCreated(
            user,
            proxy,
            _recoveryContract,
            _owner,
            _roles
        );
        return OK;
    }

    function emitUserCreated(
        address _user,
        address _proxy,
        address _recoveryContract,
        address _owner,
        uint8[] _roles
    ) 
    external 
    {
        emit UserCreated(
            _self(),
            _user,
            _proxy,
            _recoveryContract,
            _owner,
            _roles
        );
    }

    /* INTERNAL */

    function _setRoles(address _user, uint8[] _roles) internal {
        for (uint i = 0; i < _roles.length; i++) {
            if (OK != roles2Library.addUserRole(_user, _roles[i])) {
                revert();
            }
        }
    }

    function _getRoleIndex(uint8 _role) private view returns (uint8) {
        uint8 _allowedRolesCount = allowedRolesCount;
        for (uint8 _roleIdx = 0; _roleIdx < _allowedRolesCount; ++_roleIdx) {
            if (indexToRoles[_roleIdx] == _role) {
                return _roleIdx;
            }
        }
        // NOTE: Should provide only existed role
        assert(false);
    }
}
