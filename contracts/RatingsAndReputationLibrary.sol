/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 */

pragma solidity ^0.4.21;


import "solidity-storage-lib/contracts/StorageAdapter.sol";
import "solidity-roles-lib/contracts/Roles2LibraryAdapter.sol";
import "solidity-eventshistory-lib/contracts/MultiEventsHistoryAdapter.sol";
import "./base/BitOps.sol";


contract UserLibraryInterface {
    function hasArea(address _user, uint _area) public returns (bool);
    function hasCategory(address _user, uint _area, uint _category) public returns (bool);
    function hasSkill(address _user, uint _area, uint _category, uint _skill) public returns (bool);
}


contract JobControllerInterface {
    function getJobState(uint _jobId) public view returns (uint);
    function getJobClient(uint _jobId) public view returns (address);
    function getJobWorker(uint _jobId) public view returns (address);
    function getJobSkillsArea(uint _jobId) public view returns (uint);
    function getJobSkillsCategory(uint _jobId) public view returns (uint);
    function getJobSkills(uint _jobId) public view returns (uint);
    function getFinalState(uint _jobId) public view returns (uint);
    function isActivatedState(uint _jobId, uint _jobState) public view returns (bool);
}


contract BoardControllerInterface {
    function getUserStatus(uint _boardId, address _user) public returns (bool);
    function getJobsBoard(uint _jobId) public returns (uint);
}

contract RatingsAndReputationLibraryEmitter is MultiEventsHistoryAdapter {

    event UserRatingGiven(address indexed self, address indexed rater, address indexed to, uint rating);
    event JobRatingGiven(address indexed self, address indexed rater, address indexed to, uint8 rating, uint jobId);
    event SkillRatingGiven(address indexed self, address indexed rater, address indexed to, uint8 rating, uint area, uint category, uint skill, uint jobId);
    event AreaEvaluated(address indexed self, address indexed rater, address indexed to, uint8 rating, uint area);
    event CategoryEvaluated(address indexed self, address indexed rater, address indexed to, uint8 rating, uint area, uint category);
    event SkillEvaluated(address indexed self, address indexed rater, address indexed to, uint8 rating, uint area, uint category, uint skill);
    event BoardRatingGiven(address indexed self, address indexed rater, uint indexed to, uint8 rating);
    event ValidationLevelChanged(address indexed self, address indexed rater, address indexed to, uint8 newValidationLevel, uint8 previousValidationLevel);
    
    function _emitter() internal view returns (RatingsAndReputationLibraryEmitter) {
        return RatingsAndReputationLibraryEmitter(getEventsHistory());
    }

    function emitUserRatingGiven(address _rater, address _to, uint _rating) public {
        emit UserRatingGiven(_self(), _rater, _to, _rating);
    }

    function emitBoardRatingGiven(address _rater, uint _to, uint8 _rating) public {
        emit BoardRatingGiven(_self(), _rater, _to, _rating);
    }

    function emitJobRatingGiven(address _rater, address _to, uint _jobId, uint8 _rating) public {
        emit JobRatingGiven(_self(), _rater, _to, _rating, _jobId);
    }

    function emitSkillRatingGiven(address _rater, address _to, uint8 _rating, uint _area, uint _category, uint _skill, uint _jobId) public {
        emit SkillRatingGiven(_self(), _rater, _to, _rating, _area, _category, _skill, _jobId);
    }

    function emitAreaEvaluated(address _rater, address _to, uint8 _rating, uint _area) public {
        emit AreaEvaluated(_self(), _rater, _to, _rating, _area);
    }

    function emitCategoryEvaluated(address _rater, address _to, uint8 _rating, uint _area, uint _category) public {
        emit CategoryEvaluated(_self(), _rater, _to, _rating, _area, _category);
    }

    function emitSkillEvaluated(address _rater, address _to, uint8 _rating, uint _area, uint _category, uint _skill) public {
        emit SkillEvaluated(_self(), _rater, _to, _rating, _area, _category, _skill);
    }

    function emitValidationLevelChanged(address _rater, address _to, uint8 _newValidationLevel, uint8 _previousValidationLevel) public {
        emit ValidationLevelChanged(_self(), _rater, _to, _newValidationLevel, _previousValidationLevel);
    }
}

contract RatingsAndReputationLibrary is StorageAdapter, Roles2LibraryAdapter, BitOps, RatingsAndReputationLibraryEmitter {

    uint constant RATING_AND_REPUTATION_SCOPE = 17000;
    uint constant RATING_AND_REPUTATION_CANNOT_SET_RATING = RATING_AND_REPUTATION_SCOPE + 1;
    uint constant RATING_AND_REPUTATION_RATING_IS_ALREADY_SET = RATING_AND_REPUTATION_SCOPE + 2;
    uint constant RATING_AND_REPUTATION_INVALID_RATING = RATING_AND_REPUTATION_SCOPE + 3;
    uint constant RATING_AND_REPUTATION_WORKER_IS_NOT_ACTIVE = RATING_AND_REPUTATION_SCOPE + 4;
    uint constant RATING_AND_REPUTATION_INVALID_AREA_OR_CATEGORY = RATING_AND_REPUTATION_SCOPE + 5;
    uint constant RATING_AND_REPUTATION_INVALID_EVALUATION = RATING_AND_REPUTATION_SCOPE + 6;
    uint constant RATING_AND_REPUTATION_INVALID_VALIDATION_LEVEL = RATING_AND_REPUTATION_SCOPE + 7;

    /// @dev See JobDataCore#JOB_STATE constant definitions
    uint constant JOB_STATE_STARTED = 0x008;        // 00000001000
    uint constant JOB_STATE_FINALIZED = 0x100;      // 00100000000

    uint constant VALIDATION_LEVEL_MAX = 4;

    JobControllerInterface jobController;
    UserLibraryInterface userLibrary;
    BoardControllerInterface boardController;

    // Just a simple user-user rating, can be set by anyone, can be overwritten
    StorageInterface.AddressAddressUInt8Mapping userRatingsGiven;  // from => to => rating

    // Job rating, set only after job completion, can be set once both by client and worker
    // User has to set this rating after job is completed.
    StorageInterface.AddressUIntStructAddressUInt8Mapping jobRatingsGiven;  // to => jobId => {from, rating}

    // Job rating, set by client to worker. Can be set only once and can't be overwritten.
    // This rating tells how satisfied is client with worker's skills.
    // Client can skip setting this ratings if he is lazy.
    StorageInterface.AddressUIntUIntUIntUIntStructAddressUInt8Mapping skillRatingsGiven;  // to => jobId => area => category => skill => {from, rating}
    StorageInterface.UIntBoolMapping skillRatingSet;  // jobId => Whether rating was already set

    // Following ratings can be set only by evaluators anytime. Can be overwritten.
    StorageInterface.AddressUIntAddressUInt8Mapping areasEvaluated;
    StorageInterface.AddressUIntUIntAddressUInt8Mapping categoriesEvaluated;
    StorageInterface.AddressUIntUIntUIntAddressUInt8Mapping skillsEvaluated;

    StorageInterface.AddressUIntUInt8Mapping boardRating;

    /// @dev Stores user and his validation level of general profile;
    StorageInterface.AddressUIntMapping validationLevelAssigned;

    string public version = "v0.0.1";

    modifier canSetRating(uint _jobId) {
         // Ensure job is FINALIZED
        if (jobController.getJobState(_jobId) != JOB_STATE_FINALIZED) {
            _emitErrorCode(RATING_AND_REPUTATION_CANNOT_SET_RATING);
            assembly {
                mstore(0, 17001) // RATING_AND_REPUTATION_CANNOT_SET_RATING
                return(0, 32)
            }
        }
        _;
    }

    modifier canSetJobRating(uint _jobId, address _to) {
        uint rating;
        (, rating) = store.get(jobRatingsGiven, _to, _jobId);
        if (rating > 0) {
            _emitErrorCode(RATING_AND_REPUTATION_RATING_IS_ALREADY_SET);
            assembly {
                mstore(0, 17002) // RATING_AND_REPUTATION_RATING_IS_ALREADY_SET
                return(0, 32)
            }
        }

        address client = jobController.getJobClient(_jobId);
        address worker = jobController.getJobWorker(_jobId);
        if (
            ! (  // If it's neither actual client -> worker, nor worker -> client, return
                (client == msg.sender && worker == _to) ||
                (client == _to && worker == msg.sender)
            )
        ) {
            _emitErrorCode(RATING_AND_REPUTATION_CANNOT_SET_RATING);
            assembly {
                mstore(0, 17001) // RATING_AND_REPUTATION_CANNOT_SET_RATING
                return(0, 32)
            }
        }

        _;
    }

    modifier canSetSkillRating(uint _jobId, address _to) {
        if (
            jobController.getJobClient(_jobId) != msg.sender ||
            jobController.getJobWorker(_jobId) != _to ||
            !jobController.isActivatedState(_jobId, jobController.getFinalState(_jobId)) ||  // Ensure job is activated (See docs for isActiveatedState method)
            store.get(skillRatingSet, _jobId)  // Ensure skill rating wasn't set yet
        ) {
            _emitErrorCode(RATING_AND_REPUTATION_CANNOT_SET_RATING);
            assembly {
                mstore(0, 17001) // RATING_AND_REPUTATION_CANNOT_SET_RATING
                return(0, 32)
            }
        }
        _;
    }

    modifier validRating(uint8 _rating) {
        if (!_validRating(_rating)) {
            _emitErrorCode(RATING_AND_REPUTATION_INVALID_RATING);
            assembly {
                mstore(0, 17003) // RATING_AND_REPUTATION_INVALID_RATING
                return(0, 32)
            }
        }
        _;
    }

    modifier validValidationLevel(uint8 _validationLevel) {
        if (!_validValidationLevel(_validationLevel)) {
            _emitErrorCode(RATING_AND_REPUTATION_INVALID_VALIDATION_LEVEL);
            assembly {
                mstore(0, 17007) // RATING_AND_REPUTATION_INVALID_VALIDATION_LEVEL
                return(0, 32)
            }
        }

        _;
    }

    modifier onlyBoardMember(uint _boardId, address _user) {
        if (boardController.getUserStatus(_boardId, _user) != true) {
            return;
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
        jobRatingsGiven.init("jobRatingsGiven");
        userRatingsGiven.init("userRatingsGiven");
        skillRatingsGiven.init("skillRatingsGiven");
        skillRatingSet.init("skillRatingSet");
        boardRating.init("boardRating");

        validationLevelAssigned.init("validationLevelAssigned");
    }

    function setupEventsHistory(address _eventsHistory) auth external returns (uint) {
        require(_eventsHistory != 0x0);

        _setEventsHistory(_eventsHistory);
        return OK;
    }

    function setJobController(address _jobController) auth external returns (uint) {
        jobController = JobControllerInterface(_jobController);
        return OK;
    }

    function setUserLibrary(address _userLibrary) auth external returns (uint) {
        userLibrary = UserLibraryInterface(_userLibrary);
        return OK;
    }

    function setBoardController(address _boardController) auth external returns (uint) {
        boardController = BoardControllerInterface(_boardController);
        return OK;
    }

    // USER RATING

    function getUserRating(address _rater, address _to) public view returns (uint) {
        return store.get(userRatingsGiven, _rater, _to);
    }

    function setUserRating(address _to, uint8 _rating) validRating(_rating) public returns (uint) {
        store.set(userRatingsGiven, msg.sender, _to, _rating);
        _emitter().emitUserRatingGiven(msg.sender, _to, _rating);
        return OK;
    }

    // JOB RATING

    function getJobRating(address _to, uint _jobId) public view returns (address, uint8) {
        return store.get(jobRatingsGiven, _to, _jobId);
    }

    function setJobRating(
		address _to, 
		uint8 _rating, 
		uint _jobId
	)
	validRating(_rating)
	canSetRating(_jobId)
	canSetJobRating(_jobId, _to)
	public
    returns (uint) 
	{
        if (boardController.getUserStatus(boardController.getJobsBoard(_jobId), msg.sender) != true) {
          return _emitErrorCode(RATING_AND_REPUTATION_WORKER_IS_NOT_ACTIVE);
        } //If use this check in modifier, then will be "stack to deep" error
        
		store.set(jobRatingsGiven, _to, _jobId, msg.sender, _rating);
        
		_emitter().emitJobRatingGiven(msg.sender, _to, _jobId, _rating);
        return OK;
    }


    // BOARD RATING

    function setBoardRating(
		uint _to, 
		uint8 _rating
	)
	validRating(_rating)
	onlyBoardMember(_to, msg.sender)
	public
    returns (uint) 
	{
        store.set(boardRating, msg.sender, _to, _rating);
        _emitter().emitBoardRatingGiven(msg.sender, _to, _rating);
        return OK;
    }

    function getBoardRating(address _rater, uint _boardId) public view returns (uint) {
        return store.get(boardRating, _rater, _boardId);
    }


    // SKILL RATING

    function rateWorkerSkills(
		uint _jobId, 
		address _to, 
		uint _area, 
		uint _category, 
		uint[] _skills, 
		uint8[] _ratings
	)
	singleOddFlag(_area)
	singleOddFlag(_category)
	canSetRating(_jobId)
	canSetSkillRating(_jobId, _to)
	public
    returns (uint) 
	{
        if (!_checkAreaAndCategory(_jobId, _area, _category)) {
            return _emitErrorCode(RATING_AND_REPUTATION_INVALID_AREA_OR_CATEGORY);
        }

        for (uint i = 0; i < _skills.length; i++) {
            _checkSetSkill(_jobId, _to, _ratings[i], _area, _category, _skills[i]);
        }

        store.set(skillRatingSet, _jobId, true);
        return OK;
    }

    function _checkAreaAndCategory(uint _jobId, uint _area, uint _category) internal view returns (bool) {
        return jobController.getJobSkillsArea(_jobId) == _area &&
               jobController.getJobSkillsCategory(_jobId) == _category;
    }

    function _checkSetSkill(
		uint _jobId, 
		address _to, 
		uint8 _rating, 
		uint _area, 
		uint _category, 
		uint _skill
	)
    internal
    {
        require(_validRating(_rating));
        require(_isSingleFlag(_skill));  // Ensure skill is repserented correctly, as a single bit flag
        require(_hasFlag(jobController.getJobSkills(_jobId), _skill));  // Ensure the job has given skill

        store.set(skillRatingsGiven, _to, _jobId, _area, _category, _skill, msg.sender, _rating);
        store.set(skillRatingSet, _jobId, true);
        _emitter().emitSkillRatingGiven(msg.sender, _to, _rating, _area, _category, _skill, _jobId);
    }

    function getSkillRating(
		address _to, 
		uint _area, 
		uint _category, 
		uint _skill, 
		uint _jobId
	)
	public view
    returns (address, uint8) 
	{
        return store.get(skillRatingsGiven, _to, _jobId, _area, _category, _skill);
    }

    // VALIDATION LEVEL

    /// @notice Gets validation level for a `_user`, no matter worker, client or recrutier
    /// @param _user user address which validation level is requested
    function getValidationLevel(address _user) public view returns (uint8) {
        return uint8(store.get(validationLevelAssigned, _user));
    }

    /// @notice Sets validation level of a `_user`.
    /// @dev Emits ValidationLevelChanged event.
    /// @dev Only for authorized calls.
    /// @param _user user address that is presented in the system
    /// @param _level validation level; 0-4 values are possible, 4 is MAX.
    function setValidationLevel(address _user, uint8 _level) 
    external 
    auth 
    validValidationLevel(_level) 
    returns (uint) 
    {
        uint8 _previousValidationLevel = uint8(store.get(validationLevelAssigned, _user));
        store.set(validationLevelAssigned, _user, _level);

        _emitter().emitValidationLevelChanged(msg.sender, _user, _level, _previousValidationLevel);
        return OK;
    }


    // EVALUATIONS

    function getAreaEvaluation(address _to, uint _area, address _rater) public view returns (uint8) {
        return store.get(areasEvaluated, _to, _area, _rater);
    }

    function evaluateArea(address _to, uint8 _rating, uint _area) auth external returns (uint) {
        return _evaluateArea(_to, _rating, _area);
    }

    function _evaluateArea(address _to, uint8 _rating, uint _area) internal returns (uint) {
        if (!(_validRating(_rating) && userLibrary.hasArea(_to, _area))) {
            return _emitErrorCode(RATING_AND_REPUTATION_INVALID_EVALUATION);
        }

        store.set(areasEvaluated, _to, _area, msg.sender, _rating);

        _emitter().emitAreaEvaluated(msg.sender, _to, _rating, _area);
        return OK;
    }

    function getCategoryEvaluation(address _to, uint _area, uint _category, address _rater) public view returns (uint8) {
        return store.get(categoriesEvaluated, _to, _area, _category, _rater);
    }

    function evaluateCategory(address _to, uint8 _rating, uint _area, uint _category) auth external returns (uint) {
        return _evaluateCategory(_to, _rating, _area, _category);
    }

    function _evaluateCategory(address _to, uint8 _rating, uint _area, uint _category) internal returns (uint) {
        if (!_validRating(_rating) || !userLibrary.hasCategory(_to, _area, _category)) {
            return _emitErrorCode(RATING_AND_REPUTATION_INVALID_EVALUATION);
        }

        store.set(categoriesEvaluated, _to, _area, _category, msg.sender, _rating);

        _emitter().emitCategoryEvaluated(msg.sender, _to, _rating, _area, _category);
        return OK;
    }

    function getSkillEvaluation(address _to, uint _area, uint _category, uint _skill, address _rater) public view returns (uint8) {
        return store.get(skillsEvaluated, _to, _area, _category, _skill,  _rater);
    }

    function evaluateSkill(address _to, uint8 _rating, uint _area, uint _category, uint _skill) auth external returns (uint) {
        return _evaluateSkill(_to, _rating, _area, _category, _skill);
    }

    function _evaluateSkill(address _to, uint8 _rating, uint _area, uint _category, uint _skill) internal returns (uint) {
        if (!_validRating(_rating) || !userLibrary.hasSkill(_to, _area, _category, _skill)) {
            return _emitErrorCode(RATING_AND_REPUTATION_INVALID_EVALUATION);
        }

        store.set(skillsEvaluated, _to, _area, _category, _skill, msg.sender, _rating);

        _emitter().emitSkillEvaluated(msg.sender, _to, _rating, _area, _category, _skill);
        return OK;
    }

    function evaluateMany(address _to, uint _areas, uint[] _categories, uint[] _skills, uint8[] _rating) auth external returns (uint) {
        uint categoriesCounter = 0;
        uint skillsCounter = 0;
        uint ratingCounter = 0;
        //check that areas have correct format
        if (!_ifEvenThenOddTooFlags(_areas)) {
            return _emitErrorCode(RATING_AND_REPUTATION_INVALID_AREA_OR_CATEGORY);
        }
        for (uint area = 1; area != 0; area = area << 2) {
            if (!_hasFlag(_areas, area)) {
                continue;
            }
            //check if area is full
            if (_hasFlag(_areas, area << 1)) {
                if (OK != _evaluateArea(_to, _rating[ratingCounter++], area)) {
					revert();
				}
                //area is full, no need to go further to category checks
                continue;
            }
            //check that category has correct format
            if (!_ifEvenThenOddTooFlags(_categories[categoriesCounter])) {
                revert();
            }
            //check that category is not empty
            if (_categories[categoriesCounter] == 0) {
                revert();
            }
            //iterating through category to setup skills
            for (uint category = 1; category != 0; category = category << 2) {
                if (!_hasFlag(_categories[categoriesCounter], category)) {
                    continue;
                }
                //check if category is full
                if (_hasFlag(_categories[categoriesCounter], category << 1)) {
                    if (OK != _evaluateCategory(_to, _rating[ratingCounter++], area, category)) {
						revert();
					}
                    //exit when full category set
                    continue;
                }
                //check that skill is not empty
                if (_skills[skillsCounter] == 0) {
                    revert();
                }

                if (OK != _evaluateSkill(_to, _rating[ratingCounter++], area, category, _skills[skillsCounter++])) {
					revert();
				}
                // Move to next skill
            }
            // Move to next category set
            categoriesCounter++;
        }
        return OK;
    }

    // HELPERS
    
    function _validRating(uint8 _rating) internal pure returns (bool) {
        return _rating > 0 && _rating <= 10;
    }

    function _validValidationLevel(uint8 _validationLevel) private pure returns (bool) {
        return _validationLevel <= VALIDATION_LEVEL_MAX;
    }
}
