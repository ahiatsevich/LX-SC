/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 */

pragma solidity ^0.4.21;

import "solidity-storage-lib/contracts/StorageAdapter.sol";
import "./adapters/MultiEventsHistoryAdapter.sol";
import "./adapters/Roles2LibraryAdapter.sol";
import "./libs/SafeMath.sol";


contract ERC20BalanceInterface {
    function balanceOf(address _address) public view returns(uint);
}


contract BalanceHolderInterface {
    function deposit(address _from, uint _value, address _contract) public returns (bool);
    function withdraw(address _to, uint _value, address _contract) public returns (bool);
    function withdrawETH(address _to, uint _amount) external returns (bool);
}

contract PaymentGateway is StorageAdapter, MultiEventsHistoryAdapter, Roles2LibraryAdapter {

    using SafeMath for uint;

    uint constant PAYMENT_GATEWAY_SCOPE = 15000;
    uint constant PAYMENT_GATEWAY_INSUFFICIENT_BALANCE = PAYMENT_GATEWAY_SCOPE + 1;
    uint constant PAYMENT_GATEWAY_TRANSFER_FAILED = PAYMENT_GATEWAY_SCOPE + 2;
    uint constant PAYMENT_GATEWAY_NO_FEE_ADDRESS_DESTINATION = PAYMENT_GATEWAY_SCOPE + 3;


    event FeeSet(address indexed self, uint feePercent);
    event Deposited(address indexed self, address indexed by, uint value);
    event Withdrawn(address indexed self, address indexed by, uint value);
    event Transferred(address indexed self, address from, address to, uint value);

    StorageInterface.Address balanceHolder;
    StorageInterface.AddressUIntMapping balances; // contract => user => balance
    StorageInterface.Address feeAddress;
    StorageInterface.UInt fees; // 10000 is 100%.

    function PaymentGateway(
        Storage _store,
        bytes32 _crate,
        address _roles2Library
    )
    StorageAdapter(_store, _crate)
    Roles2LibraryAdapter(_roles2Library)
    public
    {
        balanceHolder.init('balanceHolder');
        balances.init('balances');
        feeAddress.init('feeAddress');
        fees.init('fees');
    }

    function setupEventsHistory(address _eventsHistory) auth external returns (uint) {
        require(_eventsHistory != 0x0);

        _setEventsHistory(_eventsHistory);
        return OK;
    }

    function setBalanceHolder(address _balanceHolder) auth external returns (uint) {  // only owner
        store.set(balanceHolder, _balanceHolder);
        return OK;
    }

    function setFeeAddress(address _feeAddress)
    external
    auth
    returns (uint)
    {
        store.set(feeAddress, _feeAddress);
        return OK;
    }

    function setFeePercent(uint _feePercent)
    external
    auth
    returns (uint)
    {
        require(_feePercent < 10000);

        store.set(fees, _feePercent);
        _emitFeeSet(_feePercent);
        return OK;
    }

    function getFeePercent()
    public
    view
    returns (uint)
    {
        return store.get(fees);
    }

    function withdraw(uint _value) public returns (uint) {
        require(_value > 0);

        return _withdraw(msg.sender, _value);
    }

    function _withdraw(address _from, uint _value) internal returns (uint) {
        if (getBalance(_from) < _value) {
            return _emitErrorCode(PAYMENT_GATEWAY_INSUFFICIENT_BALANCE);
        }

        BalanceHolderInterface _balanceHolder = getBalanceHolder();
        if (!_balanceHolder.withdrawETH(_from, _value)) {
            return _emitErrorCode(PAYMENT_GATEWAY_TRANSFER_FAILED);
        }

        store.set(balances, _from, getBalance(_from).sub(_value));

        _emitWithdrawn(_from, _value);
        return OK;
    }

    function transferWithFee(
        address _from,
        address _to,
        uint _feeFromValue,
        uint _additionalFee
    )
    public
    payable
    returns (uint)
    {
        address[] memory toArray = new address[](1);
        toArray[0] = _to;
        uint[] memory valueArray = new uint[](1);
        valueArray[0] = msg.value;
        return transferToMany(_from, toArray, valueArray, _feeFromValue, _additionalFee);
    }

    function transferToMany(
        address _from,
        address[] _to,
        uint[] _value,
        uint _feeFromValue,
        uint _additionalFee
    )
    auth
    public
    payable
    returns (uint)
    {
        require(_from != 0x0);
        require(_to.length == _value.length);

        _addBalance(_from, msg.value);
        address(getBalanceHolder()).transfer(msg.value);

         uint _total = 0;
        for (uint i = 0; i < _to.length; i++) {
            _addBalance(_to[i], _value[i]);
            _emitTransferred(_from, _to[i], _value[i]);
            _total = _total.add(_value[i]);
        }

        uint _fee = calculateFee(_feeFromValue).add(_additionalFee);
        address _feeAddress = getFeeAddress();
        if (_fee > 0 && _feeAddress != 0x0) {
            _addBalance(_feeAddress, _fee);
            _emitTransferred(_from, _feeAddress, _fee);
            _total = _total.add(_fee);
        }

        _subBalance(_from, _total);

        return OK;
    }

    function transferAll(
        address _from,
        address _to,
        uint _value,
        address _change,
        uint _feeFromValue,
        uint _additionalFee
    )
    auth
    external
    returns (uint)
    {
        require(_from != 0x0);

        _addBalance(_to, _value);
        _emitTransferred(_from, _to, _value);

        uint _total = _value;
        uint _fee = calculateFee(_feeFromValue).add(_additionalFee);
        address _feeAddress = getFeeAddress();
        if (_fee > 0 && _feeAddress != 0x0) {
            _addBalance(_feeAddress, _fee);
            _emitTransferred(_from, _feeAddress, _fee);
            _total = _total.add(_fee);
        }

        uint _changeAmount = getBalance(_from).sub(_total);
        if (_changeAmount != 0) {
            _addBalance(_change, _changeAmount);
            _emitTransferred(_from, _change, _changeAmount);
            _total = _total.add(_changeAmount);
        }

        _subBalance(_from, _total);

        return OK;
    }

    /* function transferFromMany(
        address[] _from,
        address _to,
        uint[] _value
    )
    auth
    external
    returns (uint)
    {
        require(_to != 0x0);
        require(_from.length == _value.length);

        uint _total = 0;
        for (uint i = 0; i < _from.length; i++) {
            _subBalance(_from[i], _value[i]);
            _emitTransferred(_from[i], _to, _value[i]);
            _total = _total.add(_value[i]);
        }

        _addBalance(_to, _total);

        return OK;
    } */

    // TODO
    function forwardFee(uint _value)
    public
    returns (uint)
    {
        require(_value > 0);

        address _feeAddress = getFeeAddress();
        if (_feeAddress == 0x0) {
            return _emitErrorCode(PAYMENT_GATEWAY_NO_FEE_ADDRESS_DESTINATION);
        }

        return _withdraw(_feeAddress, _value);
    }

    function getBalance(address _address)
    public
    view
    returns(uint)
    {
        return store.get(balances, _address);
    }

    function getBalanceOf(address _address)
    public
    view
    returns(uint)
    {
        return address(_address).balance;
    }

    function calculateFee(uint _value)
    public
    view
    returns (uint)
    {
        uint feeRaw = _value.mul(getFeePercent());
        return (feeRaw / 10000) + (feeRaw % 10000 == 0 ? 0 : 1);
    }

    function getFeeAddress() public view returns(address) {
        return store.get(feeAddress);
    }

    function getBalanceHolder() public view returns(BalanceHolderInterface) {
        return BalanceHolderInterface(store.get(balanceHolder));
    }

    // HELPERS

    function _addBalance(address _to, uint _value) internal {
        require(_to != 0x0);
        require(_value > 0);

        store.set(balances, _to, getBalance(_to).add(_value));
    }

    function _subBalance(address _from, uint _value) internal {
        require(_from != 0x0);
        require(_value > 0);

        store.set(balances, _from, getBalance(_from).sub(_value));
    }

    // EVENTS

    function _emitFeeSet(uint _feePercent) internal {
        PaymentGateway(getEventsHistory()).emitFeeSet(_feePercent);
    }

    function _emitDeposited(address _by, uint _value) internal {
        PaymentGateway(getEventsHistory()).emitDeposited(_by, _value);
    }

    function _emitWithdrawn(address _by, uint _value) internal {
        PaymentGateway(getEventsHistory()).emitWithdrawn(_by, _value);
    }

    function _emitTransferred(address _from, address _to, uint _value) internal {
        PaymentGateway(getEventsHistory()).emitTransferred(_from, _to, _value);
    }

    function emitFeeSet(uint _feePercent) public {
        emit FeeSet(_self(), _feePercent);
    }

    function emitDeposited(address _by, uint _value) public {
        emit Deposited(_self(), _by, _value);
    }

    function emitWithdrawn(address _by, uint _value) public {
        emit Withdrawn(_self(), _by, _value);
    }

    function emitTransferred(address _from, address _to, uint _value) public {
        emit Transferred(_self(), _from, _to, _value);
    }

}
