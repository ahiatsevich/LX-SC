/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 */

pragma solidity ^0.4.21;


import "solidity-storage-lib/contracts/StorageAdapter.sol";
import "solidity-roles-lib/contracts/Roles2LibraryAdapter.sol";
import "solidity-eventshistory-lib/contracts/MultiEventsHistoryAdapter.sol";
import "openzeppelin-solidity/contracts/MerkleProof.sol";
import "./base/BitOps.sol";
import "./UserLibrary.sol";
import "./libs/SafeMath.sol";
import "./JobsDataProvider.sol";


contract BoardControllerEmitter is MultiEventsHistoryAdapter {
    
    event BoardCreated(
        address indexed self,
        uint indexed boardId,
        address creator,
        uint boardTags,
        uint boardTagsArea,
        uint boardTagsCategory,
        bytes32 boardIpfsHash,
        bool status,
        uint boardType
    );
    event BoardCreated(
        address indexed self,
        uint indexed boardId,
        address creator,
        bytes32 invitationsMerkleRoot,
        bytes32 boardIpfsHash,
        bool status,
        uint boardType
    );
    event BoardCreated(
        address indexed self,
        uint indexed boardId,
        address creator,
        bytes32 boardIpfsHash,
        bool status,
        uint boardType
    );

    event JobBinded(address indexed self, uint indexed boardId, uint jobId, bool status);
    event UserBinded(address indexed self, uint indexed boardId, address user, bool status);
    event BoardClosed(address indexed self, uint indexed boardId, bool status);

    function emitBoardCreated(
        uint _boardId,
        address _creator,
        uint _tags,
        uint _tagsArea,
        uint _tagsCategory,
        bytes32 _ipfsHash,
        bool _boardStatus,
        uint _boardType
    )
    public
    {
        emit BoardCreated(
            _self(),
            _boardId,
            _creator,
            _tags,
            _tagsArea,
            _tagsCategory,
            _ipfsHash,
            _boardStatus,
            _boardType
        );
    }

    function emitBoardCreated(
        uint _boardId,
        address _creator,
        bytes32 _invitationsMerkleRoot,
        bytes32 _ipfsHash,
        bool _boardStatus,
        uint _boardType
    )
    public
    {
        emit BoardCreated(
            _self(),
            _boardId,
            _creator,
            _invitationsMerkleRoot,
            _ipfsHash,
            _boardStatus,
            _boardType
        );
    }

    function emitBoardCreated(
        uint _boardId,
        address _creator,
        bytes32 _ipfsHash,
        bool _boardStatus,
        uint _boardType
    )
    public
    {
        emit BoardCreated(
            _self(),
            _boardId,
            _creator,
            _ipfsHash,
            _boardStatus,
            _boardType
        );
    }

    function emitJobBinded(uint _boardId, uint _jobId, bool _status) public {
        emit JobBinded(_self(), _boardId, _jobId, _status);
    }

    function emitUserBinded(uint _boardId, address _user, bool _status) public {
        emit UserBinded(_self(), _boardId, _user, _status);
    }

    function emitBoardClosed(uint _boardId, bool _status) public {
        emit BoardClosed(_self(), _boardId, _status);
    }

    function _emitter() internal returns (BoardControllerEmitter) {
        return BoardControllerEmitter(getEventsHistory());
    }
}


contract BoardController is StorageAdapter, MultiEventsHistoryAdapter, Roles2LibraryAdapter, BitOps, BoardControllerEmitter {

    using SafeMath for uint;

    uint constant BOARD_CONTROLLER_SCOPE = 11000;
    uint constant BOARD_CONTROLLER_JOB_IS_ALREADY_BINDED = BOARD_CONTROLLER_SCOPE + 1;
    uint constant BOARD_CONTROLLER_USER_IS_ALREADY_BINDED = BOARD_CONTROLLER_SCOPE + 2;
    uint constant BOARD_CONTROLLER_USER_HAS_INCOMPLETE_SKILLS = BOARD_CONTROLLER_SCOPE + 2;
    uint constant BOARD_CONTROLLER_USER_IS_NOT_BINDED = BOARD_CONTROLLER_SCOPE + 3;
    uint constant BOARD_CONTROLLER_BOARD_IS_CLOSED = BOARD_CONTROLLER_SCOPE + 4;
    uint constant BOARD_CONTROLLER_PROOF_NOT_VERIFIED = BOARD_CONTROLLER_SCOPE + 5;
    uint constant BOARD_CONTROLLER_INVALID_BOARD_TYPE = BOARD_CONTROLLER_SCOPE + 6;
    uint constant BOARD_CONTROLLER_NOT_SUITABLE_BOARD_FOR_JOB = BOARD_CONTROLLER_SCOPE + 7;

    /// @dev Defines different type of boards with specified connection rules 
    uint constant BOARD_TYPE_OPEN = 1 << 0; /// @dev All users could connect freely
    uint constant BOARD_TYPE_BY_SKILL_MODERATION = 1 << 1; /// @dev Only users with defined skills could join
    uint constant BOARD_TYPE_BY_INVITATION = 1 << 2; /// @dev Only users who have an invitation could connect

    /// @dev Jobs Data Provider address. Read-only!
    StorageInterface.Address private jobsDataProvider;
    /// @dev UserLibrary reference
    StorageInterface.Address private userLibrary;
    StorageInterface.UInt private boardsCount;

    StorageInterface.UIntAddressMapping private boardCreator;
    StorageInterface.UIntBytes32Mapping private boardIpfsHash;

    StorageInterface.UIntUIntMapping private boardTagsArea;
    StorageInterface.UIntUIntMapping private boardTagsCategory;
    StorageInterface.UIntUIntMapping private boardTags;

    StorageInterface.UIntBoolMapping private boardStatus;
    StorageInterface.UIntUIntMapping private jobsBoard;
    
    /// @dev Counts amount of users that joined a board; [board id => number of users]; 
    ///     Could not migrate number of users from already created boards
    StorageInterface.UIntUIntMapping private usersInBoardCounter;

    /// @dev mapping(user address => set(board ids))
    StorageInterface.UIntSetMapping userBoards;

    /// @dev mapping(board id => set(job ids))
    StorageInterface.UIntSetMapping private boundJobsInBoard;

    /// @dev Mapping for boardId => board type
    StorageInterface.UIntUIntMapping private boardType;

    /// @dev Only for boards with BOARD_TYPE_BY_INVITATION type.
    ///     Stores merkle root of invited addresses and should be updated
    ///     when new invitations will be sent.
    StorageInterface.UIntBytes32Mapping private boardInvitationsMerkleRoot;

    /// @dev Specifies contract version that is accessible for user info.
    ///     NOTE: Should be bumped by developers in case of smart contract modifications.
    string public version = "v0.0.1";

    modifier notBoundJobYet(uint _boardId, uint _jobId) {
        if (store.get(jobsBoard, _jobId) != 0) {
            uint _resultCode = _emitErrorCode(BOARD_CONTROLLER_JOB_IS_ALREADY_BINDED);
            assembly {
                mstore(0, _resultCode)
                return(0, 32)
            }
        }
        _;
    }

    modifier notBoundUserYet(uint _boardId, address _user) {
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

    modifier onlyForBoardOfTypes(uint _boardId, uint _boardTypes) {
        if (store.get(boardType, _boardId) & _boardTypes == 0) {
            uint _resultCode = _emitErrorCode(BOARD_CONTROLLER_INVALID_BOARD_TYPE);
            assembly {
                mstore(0, _resultCode)
                return(0, 32)
            }
        }
        _;
    }

    modifier onlyBoardCreator(uint _boardId) {
        if (msg.sender != store.get(boardCreator, _boardId)) {
            uint _resultCode = _emitErrorCode(BOARD_CONTROLLER_INVALID_BOARD_TYPE);
            assembly {
                mstore(0, _resultCode)
                return(0, 32)
            }
        }
        _;
    }

    modifier onlyJobWithMetRequirements(uint _boardId, uint _jobId) {
        uint _boardType = store.get(boardType, _boardId);
        if (_boardType == BOARD_TYPE_BY_SKILL_MODERATION &&
            !_isJobHaveAppropriateRequirements(_boardId, _jobId)
        ) {
            uint _resultCode = _emitErrorCode(BOARD_CONTROLLER_NOT_SUITABLE_BOARD_FOR_JOB);
            assembly {
                mstore(0, _resultCode)
                return(0, 32)
            }
        }
        _;
    }

    constructor(
        Storage _store,
        bytes32 _crate,
        address _roles2Library
    )
    StorageAdapter(_store, _crate)
    Roles2LibraryAdapter(_roles2Library)
    public
    {
        jobsDataProvider.init("jobsDataProvider");
        userLibrary.init("userLibrary");

        boardsCount.init("boardsCount");
        usersInBoardCounter.init("usersInBoardCounter");

        boardCreator.init("boardCreator");

        boardTagsArea.init("boardTagsArea");
        boardTagsCategory.init("boardTagsCategory");
        boardTags.init("boardTags");

        jobsBoard.init("jobsBoard");
        boardStatus.init("boardStatus");

        boardIpfsHash.init("boardIpfsHash");
        
        userBoards.init("userBoards");
        boundJobsInBoard.init("boundJobsInBoard");

        boardType.init("boardType");
        boardInvitationsMerkleRoot.init("boardInvitationsMerkleRoot");
    }

    /// @notice Sets address of JobsDataProvider
    function setJobsDataProvider(address _jobsDataProvider) 
    external 
    auth 
    returns (uint) 
    {
        store.set(jobsDataProvider, _jobsDataProvider);
        return OK;
    }

    /// @notice Sets address of UserLibrary
    function setUserLibrary(address _userLibrary) 
    external 
    auth 
    returns (uint) 
    {
        store.set(userLibrary, _userLibrary);
        return OK;
    }

    function setupEventsHistory(address _eventsHistory) 
    external 
    auth 
    returns (uint) 
    {
        require(_eventsHistory != 0x0, "BOARD_CONTROLLER_INVALID_EVENTSHISTORY_ADDRESS");

        _setEventsHistory(_eventsHistory);
        return OK;
    }

    /// @notice Updates invitations merkle root `_invitationsRoot` in board `_boardId`
    ///     for cases when more invites were sent to users from board creator.
    ///     Only for boards with type BOARD_TYPE_BY_INVITATION.
    /// @dev Only by board creator caller.
    /// @param _boardId board identifier
    /// @param _invitationsRoot merkle root of invites list
    function updateInvitationsMerkleRoot(uint _boardId, bytes32 _invitationsRoot)
    external
    onlyBoardCreator(_boardId)
    notClosed(_boardId)
    onlyForBoardOfTypes(_boardId, BOARD_TYPE_BY_INVITATION)
    returns (uint)
    {
        store.set(boardInvitationsMerkleRoot, _boardId, _invitationsRoot);
        return OK;
    }

    /** GETTERS */

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

    /// @notice Gets amount of users joined to a `_boardId` board
    /// @dev Already created boards start counting users from 0 despite they could already have users.
    /// @param _boardId board identifier
    function getUsersInBoardCount(uint _boardId) public view returns (uint) {
        return store.get(usersInBoardCounter, _boardId);
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

    /// @notice Gets filtered boards for bound user where boards have provided
    ///     properties (tags, tags area, tags category)
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
    ///     in a paginated way
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

    /** BOARD CREATION */

    /// @notice Creates a new board with type BOARD_TYPE_BY_SKILL_MODERATION.
    ///     This board will require to have specified skills to be connected to.
    /// @dev Ony for authorized calls.
    /// @param _tags set of skills in terms of area
    /// @param _tagsArea definite area in terms of category
    /// @param _tags definite category
    function createBoard(
        uint _tags,
        uint _tagsArea,
        uint _tagsCategory,
        bytes32 _ipfsHash
    )
    external
    auth
    singleOddFlag(_tagsArea)
    singleOddFlag(_tagsCategory)
    hasFlags(_tags)
    returns (uint)
    {
        uint boardId = store.get(boardsCount) + 1;
        store.set(boardsCount, boardId);
        store.set(boardCreator, boardId, msg.sender);
        store.set(boardType, boardId, BOARD_TYPE_BY_SKILL_MODERATION);
        store.set(boardTagsArea, boardId, _tagsArea);
        store.set(boardTagsCategory, boardId, _tagsCategory);
        store.set(boardTags, boardId, _tags);
        store.set(boardStatus, boardId, true);
        store.set(boardIpfsHash, boardId, _ipfsHash);

        _emitter().emitBoardCreated(boardId, msg.sender, _tags, _tagsArea, _tagsCategory, _ipfsHash, true, BOARD_TYPE_BY_SKILL_MODERATION);
        return OK;
    }

    /// @notice Creates a new board with type BOARD_TYPE_BY_INVITATION.
    ///     This board could be connected ONLY by invitation.
    ///     Use Merkle root and merkle proof to connect to a board.
    /// @dev Ony for authorized calls.
    /// @param _invitationsMerkleRoot merkle root hash calculated from a list of
    ///                                invited addresses
    /// @param _ipfsHash hash of board description record in IPFS
    function createBoardByInvitations( // TODO: alesanro rename to overloaded `createBoard` method after fixes in web3
        bytes32 _invitationsMerkleRoot,
        bytes32 _ipfsHash
    )
    external
    auth
    returns (uint)
    {
        uint boardId = store.get(boardsCount) + 1;
        store.set(boardsCount, boardId);
        store.set(boardCreator, boardId, msg.sender);
        store.set(boardType, boardId, BOARD_TYPE_BY_INVITATION);
        store.set(boardStatus, boardId, true);
        store.set(boardIpfsHash, boardId, _ipfsHash);
        store.set(boardInvitationsMerkleRoot, boardId, _invitationsMerkleRoot);

        _emitter().emitBoardCreated(boardId, msg.sender, _invitationsMerkleRoot, _ipfsHash, true, BOARD_TYPE_BY_INVITATION);
        return OK;
    }

    /// @notice Creates a new board with type BOARD_TYPE_OPEN. 
    ///     This board could be connected by anyone 
    ///     without any restrictions and validations.
    /// @dev Emits BoardCreated event.
    /// @dev Ony for authorized calls.
    /// @param _ipfsHash hash of board description record in IPFS
    function createBoardWithoutRestrictions( // TODO: alesanro rename to overloaded `createBoard` method after fixes in web3
        bytes32 _ipfsHash
    )
    external
    auth
    returns (uint)
    {
        uint boardId = store.get(boardsCount) + 1;
        store.set(boardsCount, boardId);
        store.set(boardCreator, boardId, msg.sender);
        store.set(boardType, boardId, BOARD_TYPE_OPEN);
        store.set(boardStatus, boardId, true);
        store.set(boardIpfsHash, boardId, _ipfsHash);

        _emitter().emitBoardCreated(boardId, msg.sender, _ipfsHash, true, BOARD_TYPE_OPEN);
        return OK;
    }

    /** BOARD BINDING */

    /// @notice Binds job `_jobId` with board `_boardId`.
    ///     Job should met requirements of the board according to category, area
    ///     and skills, otherwise it couldn't be bound.
    ///     Board should not be closed to successfully bind with the board.
    ///     Job should not be bound to any board before.
    /// @dev Only for authorized calls.
    /// @dev Emits UserBinded event (with 'true' bind status).
    /// @param _boardId board identifier which will be used for binding
    /// @param _jobId job identifier that will be bound to the board.
    function bindJobWithBoard(
        uint _boardId,
        uint _jobId
    )
    external
    auth
    notClosed(_boardId)
    notBoundJobYet(_boardId, _jobId)
    onlyJobWithMetRequirements(_boardId, _jobId)
    returns (uint)
    {
        store.set(jobsBoard, _jobId, _boardId);
        store.add(boundJobsInBoard, bytes32(_boardId), _jobId);

        _emitter().emitJobBinded(_boardId, _jobId, true);
        return OK;
    }

    /// @notice Binds `_user` with a board `_boardId`. 
    ///     Suites for BOARD_TYPE_OPEN and BOARD_TYPE_BY_SKILL_MODERATION 
    ///     board types:
    ///     - in case if board has type BOARD_TYPE_OPEN type
    ///     then no check will be performed. 
    ///     - in case of BOARD_TYPE_BY_SKILL_MODERATION type user's skill check
    ///     and appropriance of user will be validated.
    ///     Board should not be closed to successfully bind with the board.
    ///     Job should not be bound to any board before.
    /// @dev It checks according to user's skills held in UserLibrary.
    ///     Changes will come soon (migration to merkle proof approach).
    /// @dev Only for authorized calls.
    /// @dev Emits UserBinded event (with 'true' bind status).
    /// @param _boardId board identifier which will be used for binding
    /// @param _user user address to bind with board
    function bindUserWithBoard(
        uint _boardId,
        address _user
    )
    external
    auth
    notClosed(_boardId)
    onlyForBoardOfTypes(_boardId, BOARD_TYPE_OPEN | BOARD_TYPE_BY_SKILL_MODERATION)
    notBoundUserYet(_boardId, _user)
    returns (uint)
    {
        return _bindUserWithBoard(_boardId, _user);
    }

    /// @dev Continuation of 'bindUserWithBoard' function but without modifiers
    function _bindUserWithBoard(
        uint _boardId,
        address _user
    )
    private
    returns (uint)
    {
        uint _boardType = store.get(boardType, _boardId);
        if (_boardType == BOARD_TYPE_BY_SKILL_MODERATION &&
            !_isUserHaveSkills(_boardId, _user)
        ) {
            return _emitErrorCode(BOARD_CONTROLLER_USER_HAS_INCOMPLETE_SKILLS);
        }

        store.add(userBoards, bytes32(_user), _boardId);
        store.set(usersInBoardCounter, _boardId, getUsersInBoardCount(_boardId).add(1));

        _emitter().emitUserBinded(_boardId, _user, true);
        return OK;
    }

    /// @notice Binds `msg.sender` with a board `_boardId`. 
    ///     Suites for BOARD_TYPE_OPEN and BOARD_TYPE_BY_SKILL_MODERATION 
    ///     board types. In case if board has type BOARD_TYPE_OPEN type
    ///     then no check will be performed. 
    ///     In case of BOARD_TYPE_BY_SKILL_MODERATION type user's skill check
    ///     and appropriance of user will be validated.
    ///     Board should not be closed to successfully bind with the board.
    /// @dev Emits UserBinded event (with 'true' bind status).
    /// @param _boardId board identifier which will be used for binding
    function bindWithBoard(
        uint _boardId
    )
    external
    returns (uint)
    {
        return this.bindUserWithBoard(_boardId, msg.sender);
    }

    /// @notice Binds `_user` with a board `_boardId` of type BOARD_TYPE_BY_INVITATION.
    ///     Caller should provide `_invitationProof` proof based on list of invitees 
    ///     that is build from Merkle tree.
    /// @dev Emits UserBinded event (with 'true' bind status).
    /// @dev Only for authorized calls.
    /// @param _boardId board identifier which will be used for binding
    /// @param _user user address to bind with board; should be included in invitees list
    /// @param _invitationProof merkle proof array that proofs that the user is invited
    function bindUserWithBoardByInvitation(
        uint _boardId,
        address _user,
        bytes32[] _invitationProof
    )
    external
    auth
    notClosed(_boardId)
    onlyForBoardOfTypes(_boardId, BOARD_TYPE_BY_INVITATION)
    notBoundUserYet(_boardId, _user)
    returns (uint)
    {
        return _bindUserWithBoardByInvitation(_boardId, _user, _invitationProof);
    }

    /// @dev Continuation of 'bindUserWithBoardByInvitation' function but without modifiers
    function _bindUserWithBoardByInvitation(
        uint _boardId,
        address _user,
        bytes32[] _invitationProof
    )
    private
    returns (uint)
    {
        bool _verified = MerkleProof.verifyProof(
            _invitationProof, 
            store.get(boardInvitationsMerkleRoot, _boardId), 
            keccak256(abi.encodePacked(_user))
        );
        if (_verified) {
            store.add(userBoards, bytes32(_user), _boardId);
            store.set(usersInBoardCounter, _boardId, getUsersInBoardCount(_boardId).add(1));

            _emitter().emitUserBinded(_boardId, _user, true);
            return OK;
        }

        return _emitErrorCode(BOARD_CONTROLLER_PROOF_NOT_VERIFIED);
    }

    /// @notice Binds `msg.sender` with a board `_boardId` of type BOARD_TYPE_BY_INVITATION.
    ///     Caller should provide `_invitationProof` proof based on list of invitees 
    ///     that is build from Merkle tree.
    /// @dev Emits UserBinded event (with 'true' bind status).
    /// @param _boardId board identifier which will be used for binding
    /// @param _invitationProof merkle proof array that proofs that the user is invited
    function bindWithBoardByInvitation(
        uint _boardId,
        bytes32[] _invitationProof
    )
    external
    returns (uint)
    {   
        return this.bindUserWithBoardByInvitation(_boardId, msg.sender, _invitationProof);
    }

    /// @notice Unbind `_user` from board `_boardId`.
    ///     General for any board type.
    /// @dev Only for authorized calls.
    /// @dev Emits UserBinded event (with 'false' bind status).
    /// @param _boardId board identifier which will be used for unbinding
    /// @param _user user address to unbind from board
    function unbindUserFromBoard(
        uint _boardId,
        address _user
    )
    external 
    auth
    onlyBoundUser(_boardId, _user)
    returns (uint) 
    {
        store.remove(userBoards, bytes32(_user), _boardId);
        store.set(usersInBoardCounter, _boardId, getUsersInBoardCount(_boardId).sub(1));

        _emitter().emitUserBinded(_boardId, _user, false);
        return OK;
    }

    /// @notice Unbind `msg.sender` from board `_boardId`.
    ///     General for any board type.
    /// @dev Emits UserBinded event (with 'false' bind status).
    /// @param _boardId board identifier which will be used for unbinding
    function unbindFromBoard(
        uint _boardId
    )
    external 
    returns (uint) 
    {
        return this.unbindUserFromBoard(_boardId, msg.sender);
    }

    /// @notice Closes board. After that the board `_boardId` will not
    ///     be available for binding users and jobs
    /// @dev Only for authorized calls.
    /// @dev Emits BoardClosed event.
    /// @param _boardId board identifier that will be closed
    function closeBoard(
        uint _boardId
    )
    external
    auth
    notClosed(_boardId)
    returns (uint)
    {
        store.set(boardStatus, _boardId, false);

        _emitter().emitBoardClosed(_boardId, false);
        return OK;
    }

    /** INTERNAL */

    /// @dev Checks if provided user has all needed skills that 
    ///     are associated with boards to perform any actions
    function _isUserHaveSkills(uint _boardId, address _user)
    private
    view
    returns (bool)
    {
        UserLibrary _userLibrary = UserLibrary(store.get(userLibrary));
        if (address(_userLibrary) == 0x0) {
            return false;
        }

        return !_userLibrary.hasSkills(
            _user, 
            store.get(boardTags, _boardId),
            store.get(boardTagsArea, _boardId),
            store.get(boardTagsCategory, _boardId)
        );
    }

    function _isJobHaveAppropriateRequirements(uint _boardId, uint _jobId)
    private
    view
    returns (bool)
    {
        JobsDataProvider _jobsDataProvider = JobsDataProvider(store.get(jobsDataProvider));
        return store.get(boardTagsCategory, _boardId) == _jobsDataProvider.getJobSkillsCategory(_jobId) &&
            store.get(boardTagsArea, _boardId) == _jobsDataProvider.getJobSkillsArea(_jobId) &&
            store.get(boardTags, _boardId) == _jobsDataProvider.getJobSkills(_jobId);
    }
}
