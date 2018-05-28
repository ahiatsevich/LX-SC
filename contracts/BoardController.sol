/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 */

pragma solidity ^0.4.18;


import './adapters/StorageAdapter.sol';
import './adapters/MultiEventsHistoryAdapter.sol';
import './adapters/Roles2LibraryAdapter.sol';
import './base/BitOps.sol';
import "./JobsDataProvider.sol";


contract BoardController is StorageAdapter, MultiEventsHistoryAdapter, Roles2LibraryAdapter, BitOps {

    uint constant BOARD_CONTROLLER_SCOPE = 11000;
    uint constant BOARD_CONTROLLER_JOB_IS_ALREADY_BINDED = BOARD_CONTROLLER_SCOPE + 1;
    uint constant BOARD_CONTROLLER_USER_IS_ALREADY_BINDED = BOARD_CONTROLLER_SCOPE + 2;
    uint constant BOARD_CONTROLLER_USER_IS_NOT_BINDED = BOARD_CONTROLLER_SCOPE + 3;
    uint constant BOARD_CONTROLLER_BOARD_IS_CLOSED = BOARD_CONTROLLER_SCOPE + 4;

    event BoardCreated(
        address indexed self,
        uint indexed boardId,
        address creator,
        uint boardTags,
        uint boardTagsArea,
        uint boardTagsCategory,
        bytes32 boardIpfsHash,
        bool status
    );
    event JobBinded(address indexed self, uint indexed boardId, uint jobId, bool status);
    event UserBinded(address indexed self, uint indexed boardId, address user, bool status);
    event BoardClosed(address indexed self, uint indexed boardId, bool status);

    /// @dev Jobs Data Provider address. Read-only!
    StorageInterface.Address jobsDataProvider;
    StorageInterface.UInt boardsCount;

    StorageInterface.UIntAddressMapping boardCreator;
    StorageInterface.UIntBytes32Mapping boardIpfsHash;

    StorageInterface.UIntUIntMapping boardTagsArea;
    StorageInterface.UIntUIntMapping boardTagsCategory;
    StorageInterface.UIntUIntMapping boardTags;

    StorageInterface.UIntBoolMapping boardStatus;
    StorageInterface.UIntUIntMapping jobsBoard;
    
    /// @dev mapping(user address => set(board ids))
    StorageInterface.UIntSetMapping userBoards;
    /// @dev mapping(board id => set(job ids))
    StorageInterface.UIntSetMapping boundJobsInBoard;

    modifier notBindedJobYet(uint _boardId, uint _jobId) {
        if (store.get(jobsBoard, _jobId) != 0) {
            uint _resultCode = _emitErrorCode(BOARD_CONTROLLER_JOB_IS_ALREADY_BINDED);
            assembly {
                mstore(0, _resultCode)
                return(0, 32)
            }
        }
        _;
    }

    modifier notBindedUserYet(uint _boardId, address _user) {
        if (getUserStatus(_boardId, _user) == true) {
            uint _resultCode = _emitErrorCode(BOARD_CONTROLLER_USER_IS_ALREADY_BINDED);
            assembly {
                mstore(0, _resultCode)
                return(0, 32)
            }
        }
        _;
    }

    modifier onlyBoundUser(uint _boardId, address _user) {
        if (getUserStatus(_boardId, _user) == false) {
            uint _resultCode = _emitErrorCode(BOARD_CONTROLLER_USER_IS_NOT_BINDED);
            assembly {
                mstore(0, _resultCode)
                return(0, 32)
            }
        }
        _;
    }

    modifier notClosed(uint _boardId) {
        if (store.get(boardStatus, _boardId) == false) {
            uint _resultCode = _emitErrorCode(BOARD_CONTROLLER_BOARD_IS_CLOSED);
            assembly {
                mstore(0, _resultCode)
                return(0, 32)
            }
        }
        _;
    }

    function BoardController(
        Storage _store,
        bytes32 _crate,
        address _roles2Library
    )
    StorageAdapter(_store, _crate)
    Roles2LibraryAdapter(_roles2Library)
    public
    {
        jobsDataProvider.init("jobsDataProvider");
        
        boardsCount.init("boardsCount");

        boardCreator.init("boardCreator");

        boardTagsArea.init("boardTagsArea");
        boardTagsCategory.init("boardTagsCategory");
        boardTags.init("boardTags");

        jobsBoard.init("jobsBoard");
        boardStatus.init("boardStatus");

        boardIpfsHash.init("boardIpfsHash");
        
        userBoards.init("userBoards");
        boundJobsInBoard.init("boundJobsInBoard");
    }

    function setJobsDataProvider(address _jobsDataProvider) auth external returns (uint) {
        store.set(jobsDataProvider, _jobsDataProvider);
        return OK;
    }

    function setupEventsHistory(address _eventsHistory) auth external returns (uint) {
        require(_eventsHistory != 0x0);

        _setEventsHistory(_eventsHistory);
        return OK;
    }

    function getBoardsCount() public view returns (uint) {
        return store.get(boardsCount);
    }

    function getBoardStatus(uint _boardId) public view returns (bool) {
        return store.get(boardStatus, _boardId);
    }

    function getJobStatus(uint _boardId, uint _jobId) public view returns (bool) {
        return store.includes(boundJobsInBoard, bytes32(_boardId), _jobId);
    }

    function getUserStatus(uint _boardId, address _user) public view returns (bool) {
        return store.includes(userBoards, bytes32(_user), _boardId);
    }

    function getJobsBoard(uint _jobId) public view returns (uint) {
        return store.get(jobsBoard, _jobId);
    }

    function getBoardIpfsHash(uint _jobId) public view returns (bytes32) {
        return store.get(boardIpfsHash, _jobId);
    }

    function getBoardsByIds(uint[] _ids)
    public
    view 
    returns (
        uint[] _gotIds,
        address[] _creators,
        bytes32[] _ipfs,
        uint[] _tags,
        uint[] _tagsAreas,
        uint[] _tagsCategories,
        bool[] _status
    ) {
        _gotIds = _ids;
        _creators = new address[](_ids.length);
        _ipfs = new bytes32[](_ids.length);
        _tags = new uint[](_ids.length);
        _tagsAreas = new uint[](_ids.length);
        _tagsCategories = new uint[](_ids.length);
        _status = new bool[](_ids.length);

        for (uint _idIdx = 0; _idIdx < _ids.length; ++_idIdx) {
            uint _id = _ids[_idIdx];
            _creators[_idIdx] = store.get(boardCreator, _id);
            _ipfs[_idIdx] = store.get(boardIpfsHash, _id);
            _tags[_idIdx] = store.get(boardTags, _id);
            _tagsAreas[_idIdx] = store.get(boardTagsArea, _id);
            _tagsCategories[_idIdx] = store.get(boardTagsCategory, _id);
            _status[_idIdx] = getBoardStatus(_id);
        }
    }

    /// @notice Gets filtered list of boards' ids in paginated way across all created boards
    function getBoards(
        uint _tags, 
        uint _tagsArea, 
        uint _tagsCategory, 
        uint _fromId, 
        uint _maxLen
    ) 
    public 
    view 
    returns (uint[] _ids) 
    {
        _ids = new uint[](_maxLen);
        uint _pointer = 0;
        for (uint _id = _fromId; _id < _fromId + _maxLen; ++_id) {
            if (_filterBoard(_id, _tags, _tagsArea, _tagsCategory)) {
                _ids[_pointer] = _id;
                _pointer += 1;
            }
        }
    }

    /// @notice Gets filtered boards for bound user 
    /// where boards have provided properties (tags, 
    /// tags area, tags category)
    function getBoardsForUser(
        address _user, 
        uint _tags, 
        uint _tagsArea, 
        uint _tagsCategory
    )  
    public 
    view 
    returns (uint[] _ids) 
    {
        uint _count = store.count(userBoards, bytes32(_user));
        _ids = new uint[](_count);
        uint _pointer = 0;
        for (uint _boardIdx = 0; _boardIdx <= _count; ++_boardIdx) {
            uint _boardId = store.get(userBoards, bytes32(_user), _boardIdx);
            if (_filterBoard(_boardId, _tags, _tagsArea, _tagsCategory)) {
                _ids[_pointer] = _boardId;
                _pointer += 1;
            }
        }
    }

    function _filterBoard(
        uint _boardId,
        uint _tags, 
        uint _tagsArea, 
        uint _tagsCategory 
    ) 
    private 
    view 
    returns (bool) 
    {
        return _hasFlag(store.get(boardTags, _boardId), _tags) &&
            _hasFlag(store.get(boardTagsArea, _boardId), _tagsArea) &&
            _hasFlag(store.get(boardTagsCategory, _boardId), _tagsCategory);   
    }
    
    function getJobsInBoardCount(uint _boardId) public view returns (uint) {
        return store.count(boundJobsInBoard, bytes32(_boardId));
    }

    /// @notice Gets jobs ids that a binded with a provided board
    /// in a paginated way
    function getJobsInBoard(
        uint _boardId, 
        uint _jobState, 
        uint _fromIdx, 
        uint _maxLen
    )
    public
    view
    returns (uint[] _ids) {
        uint _count = store.count(boundJobsInBoard, bytes32(_boardId));
        require(_fromIdx < _count);
        _maxLen = (_fromIdx + _maxLen < _count) ? _maxLen : (_count - _fromIdx);
        JobsDataProvider _jobsDataProvider = JobsDataProvider(store.get(jobsDataProvider));
        _ids = new uint[](_maxLen);
        uint _pointer = 0;
        for (uint _jobIdx = _fromIdx; _jobIdx <= _fromIdx + _maxLen; ++_jobIdx) {
            uint _jobId = store.get(boundJobsInBoard, bytes32(_boardId), _jobIdx);
            if (address(_jobsDataProvider) == 0x0 || 
                _jobsDataProvider.getJobState(_jobId) == _jobState
            ) {
                _ids[_pointer] = _jobId;
                _pointer += 1;
            }
        }
    }

    function createBoard(
        uint _tags,
        uint _tagsArea,
        uint _tagsCategory,
        bytes32 _ipfsHash
    )
    auth
    singleOddFlag(_tagsArea)
    singleOddFlag(_tagsCategory)
    hasFlags(_tags)
    external
    returns (uint)
    {
        uint boardId = store.get(boardsCount) + 1;
        store.set(boardsCount, boardId);
        store.set(boardCreator, boardId, msg.sender);
        store.set(boardTagsArea, boardId, _tagsArea);
        store.set(boardTagsCategory, boardId, _tagsCategory);
        store.set(boardTags, boardId, _tags);
        store.set(boardStatus, boardId, true);
        store.set(boardIpfsHash, boardId, _ipfsHash);
        _emitBoardCreated(boardId, msg.sender, _tags, _tagsArea, _tagsCategory, _ipfsHash, true);
        return OK;
    }

    function bindJobWithBoard(
        uint _boardId,
        uint _jobId
    )
    notBindedJobYet(_boardId, _jobId)
    notClosed(_boardId)
    public
    returns (uint)
    {
        store.set(jobsBoard, _jobId, _boardId);
        store.add(boundJobsInBoard, bytes32(_boardId), _jobId);
        _emitJobBinded(_boardId, _jobId, true);
        return OK;
    }

    function bindUserWithBoard(
        uint _boardId,
        address _user
    )
    notBindedUserYet(_boardId, _user)
    notClosed(_boardId)
    public
    returns (uint)
    {
        store.add(userBoards, bytes32(_user), _boardId);
        _emitUserBinded(_boardId, _user, true);
        return OK;
    }

    function unbindUserFromBoard(
        uint _boardId,
        address _user
    )
    onlyBoundUser(_boardId, _user)
    public 
    returns (uint) 
    {
        store.remove(userBoards, bytes32(_user), _boardId);
        _emitUserBinded(_boardId, _user, false);
        return OK;
    }

    function closeBoard(
        uint _boardId
    )
    auth
    notClosed(_boardId)
    external
    returns (uint)
    {
        store.set(boardStatus, _boardId, false);
        _emitBoardClosed(_boardId, false);
        return OK;
    }

    function _emitBoardCreated(
        uint _boardId,
        address _creator,
        uint _tags,
        uint _tagsArea,
        uint _tagsCategory,
        bytes32 _ipfsHash,
        bool _boardStatus
    )
    internal
    {
        BoardController(getEventsHistory()).emitBoardCreated(
            _boardId,
            _creator,
            _tags,
            _tagsArea,
            _tagsCategory,
            _ipfsHash,
            _boardStatus
        );
    }

    function emitBoardCreated(
        uint _boardId,
        address _creator,
        uint _tags,
        uint _tagsArea,
        uint _tagsCategory,
        bytes32 _ipfsHash,
        bool _boardStatus
    )
    public
    {
        BoardCreated(
            _self(),
            _boardId,
            _creator,
            _tags,
            _tagsArea,
            _tagsCategory,
            _ipfsHash,
            _boardStatus
        );
    }

    function emitJobBinded(uint _boardId, uint _jobId, bool _status) public {
        JobBinded(_self(), _boardId, _jobId, _status);
    }

    function emitUserBinded(uint _boardId, address _user, bool _status) public {
        UserBinded(_self(), _boardId, _user, _status);
    }

    function emitBoardClosed(uint _boardId, bool _status) public {
        BoardClosed(_self(), _boardId, _status);
    }

    /* INTERNAL */

    function _emitJobBinded(uint _boardId, uint _jobId, bool _status) internal {
        BoardController(getEventsHistory()).emitJobBinded(_boardId, _jobId, _status);
    }

    function _emitUserBinded(uint _boardId, address _user, bool _status) internal {
        BoardController(getEventsHistory()).emitUserBinded(_boardId, _user, _status);
    }

    function _emitBoardClosed(uint _boardId, bool _status) internal {
        BoardController(getEventsHistory()).emitBoardClosed(_boardId, _status);
    }
}
