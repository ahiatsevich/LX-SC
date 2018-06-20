/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 */

pragma solidity ^0.4.21;


import "solidity-shared-lib/contracts/ERC20Interface.sol";
import "./adapters/Roles2LibraryAdapter.sol";

contract BalanceHolder is Roles2LibraryAdapter {

    function BalanceHolder(address _roles2Library)
    Roles2LibraryAdapter(_roles2Library)
    public
    {
    }

    function deposit(address _from, uint _value, ERC20Interface _contract)
    external
    auth
    returns (bool)
    {
        return _contract.transferFrom(_from, this, _value);
    }

    function withdraw(address _to, uint _value, ERC20Interface _contract)
    external
    auth
    returns (bool)
    {
        return _contract.transfer(_to, _value);
    }

    function withdrawETH(address _to, uint _amount)
    external
    auth
    returns (bool)
    {
        require(_to != address(0));

        if(_amount > address(this).balance) {
            return false;
        }

        _to.transfer(_amount);
        return true;
    }

    function ()
    public
    payable
    {        
    }
}
