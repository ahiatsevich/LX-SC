/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 */

pragma solidity ^0.4.21;

import "solidity-storage-lib/contracts/BaseStorageManager.sol";
import "./adapters/MultiEventsHistoryAdapter.sol";


contract StorageManager is BaseStorageManager, MultiEventsHistoryAdapter {
    
    function setupEventsHistory(address _eventsHistory) onlyContractOwner external returns (bool) {
        if (getEventsHistory() != 0x0) {
            return false;
        }
        _setEventsHistory(_eventsHistory);
        return true;
    }
}
