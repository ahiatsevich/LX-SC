pragma solidity 0.4.8;

import './Owned.sol';
import './StorageAdapter.sol';
import './MultiEventsHistoryAdapter.sol';

contract IPFSLibrary is StorageAdapter, MultiEventsHistoryAdapter, Owned {
    StorageInterface.AddressBytes32Bytes32Mapping ipfsHashes;

    event HashSet(address indexed self, address indexed setter, bytes32 indexed key, bytes32 hash);

    function IPFSLibrary(Storage _store, bytes32 _crate) StorageAdapter(_store, _crate) {
        ipfsHashes.init('ipfsHashes');
    }

    function setupEventsHistory(address _eventsHistory) onlyContractOwner() returns(bool) {
        if (getEventsHistory() != 0x0) {
            return false;
        }
        _setEventsHistory(_eventsHistory);
        return true;
    }

    function getHash(address _from, bytes32 _itemName) constant returns(bytes32) {
        return store.get(ipfsHashes, _from, _itemName);
    }

    function setHash(bytes32 _itemName, bytes32 _itemHash) returns(bool) {
        store.set(ipfsHashes, msg.sender, _itemName, _itemHash);
        _emitHashSet(msg.sender, _itemName, _itemHash);
        return true;
    }

    function _emitHashSet(address _from, bytes32 _itemName, bytes32 _itemHash) internal {
        IPFSLibrary(getEventsHistory()).emitHashSet(_from, _itemName, _itemHash);
    }

    function emitHashSet(address _from, bytes32 _itemName, bytes32 _itemHash) {
        HashSet(_self(), _from, _itemName, _itemHash);
    }
}
