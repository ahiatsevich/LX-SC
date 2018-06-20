/**
* Copyright 2017–2018, LaborX PTY
* Licensed under the AGPL Version 3 license.
*/

pragma solidity ^0.4.21;

import "solidity-shared-lib/contracts/Owned.sol";
import "solidity-storage-lib/contracts/StorageAdapter.sol";
import "./adapters/Roles2LibraryAdapter.sol";

/**
*  @title ContractsManager
*/
contract ContractsManager is Owned, StorageAdapter, Roles2LibraryAdapter {
    uint constant OK = 1;
    uint constant ERROR_CONTRACT_EXISTS = 10000;
    uint constant ERROR_CONTRACT_NOT_EXISTS = 10001;

    StorageInterface.AddressesSet contractsAddresses;
    StorageInterface.Bytes32AddressMapping contractsTypes;

    event ContractsManagerAddContract(address indexed contractAddress, bytes32 t);
    event ContractsManagerRemoveContract(address indexed contractAddress);
    event Error(address indexed self, uint errorCode);

    /**
    *  @notice Constructor that sets `storage` and `crate` to given values.
    */
    function ContractsManager(Storage _store, bytes32 _crate, address _roles2Library)
    public
    StorageAdapter(_store, _crate)
    Roles2LibraryAdapter(_roles2Library)
    {
        contractsAddresses.init('contracts');
        contractsTypes.init('contractTypes');
    }

    /**
    *  @dev Allow owner to add new contract
    *
    *  @param _contract contacts address
    *  @param _type contracts type
    *
    *  @return result code, 1 if success, otherwise error code
    */
    function addContract(address _contract, bytes32 _type)
    public
    auth()
    returns (uint)
    {
        if (isExists(_contract)) {
            return emitError(ERROR_CONTRACT_EXISTS);
        }

        store.add(contractsAddresses, _contract);
        store.set(contractsTypes, _type, _contract);

        emit ContractsManagerAddContract(_contract, _type);
        return OK;
    }

    /**
    *  @dev Allow owner to add new contract
    *
    *  @param _contract contacts address
    *
    *  @return result code, 1 if success, otherwise error code
    */
    function removeContract(address _contract)
    public
    auth()
    returns (uint)
    {
        if (!isExists(_contract)) {
            return emitError(ERROR_CONTRACT_NOT_EXISTS);
        }

        store.remove(contractsAddresses, _contract);
        // TODO
        //store.remove(contractsTypes, _type, _contract);

        emit ContractsManagerRemoveContract(_contract);
        return OK;
    }

    /**
    *   @dev Returns an array containing all contracts addresses.
    *   @return Array of token addresses.
    */
    function getContractAddresses()
    public
    view
    returns (address[])
    {
        return store.get(contractsAddresses);
    }

    /**
    *   @dev Returns a contracts address by given type.
    *   @return contractAddress
    */
    function getContractAddressByType(bytes32 _type)
    public
    view
    returns (address contractAddress)
    {
        return store.get(contractsTypes, _type);
    }

    /**
    *  @dev Tells whether a contract wit a given address exists.
    *
    *  @return `true` if a contract has been registers, otherwise `false`
    */
    function isExists(address _contract)
    public
    view
    returns (bool)
    {
        return store.includes(contractsAddresses, _contract);
    }

    /**
    *  @dev Util function which throws error event with a given error
    */
    function emitError(uint e)
    private
    returns (uint)
    {
        emit Error(msg.sender, e);
        return e;
    }
}
