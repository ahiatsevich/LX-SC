/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 */

pragma solidity ^0.4.18;


import "./adapters/MultiEventsHistoryAdapter.sol";
import "./adapters/Roles2LibraryAdapter.sol";
import "./adapters/StorageAdapter.sol";
import "./base/BitOps.sol";
import "./JobDataCore.sol";


contract UserLibraryInterface {
    function hasSkills(address _user, uint _area, uint _category, uint _skills) public view returns (bool);
}


contract PaymentProcessorInterface {
    function lockPayment(bytes32 _operationId, address _from) public payable returns (uint);
    function releasePayment(bytes32 _operationId, address _to, uint _value, address _change, uint _feeFromValue, uint _additionalFee) public returns (uint);
}


contract JobController is JobDataCore, MultiEventsHistoryAdapter, Roles2LibraryAdapter, BitOps {

    uint constant JOB_CONTROLLER_SCOPE = 13000;
    uint constant JOB_CONTROLLER_INVALID_ESTIMATE = JOB_CONTROLLER_SCOPE + 1;
    uint constant JOB_CONTROLLER_INVALID_SKILLS = JOB_CONTROLLER_SCOPE + 2;
    uint constant JOB_CONTROLLER_INVALID_STATE = JOB_CONTROLLER_SCOPE + 3;
    uint constant JOB_CONTROLLER_WORKER_RATE_NOT_SET = JOB_CONTROLLER_SCOPE + 4;
    uint constant JOB_CONTROLLER_WORK_IS_ALREADY_PAUSED = JOB_CONTROLLER_SCOPE + 5;
    uint constant JOB_CONTROLLER_WORK_IS_NOT_PAUSED = JOB_CONTROLLER_SCOPE + 6;

    event JobPosted(address indexed self, uint indexed jobId, address client, uint skillsArea, uint skillsCategory, uint skills, uint defaultPay, bytes32 detailsIPFSHash, bool bindStatus);
    event JobOfferPosted(address indexed self, uint indexed jobId, address worker, uint rate, uint estimate, uint ontop);
    event JobOfferAccepted(address indexed self, uint indexed jobId, address worker);
    event WorkStarted(address indexed self, uint indexed jobId, uint at);
    event TimeAdded(address indexed self, uint indexed jobId, uint time);  // Additional `time` in minutes
    event WorkPaused(address indexed self, uint indexed jobId, uint at);
    event WorkResumed(address indexed self, uint indexed jobId, uint at);
    event WorkFinished(address indexed self, uint indexed jobId, uint at);
    event PaymentReleased(address indexed self, uint indexed jobId);
    event JobCanceled(address indexed self, uint indexed jobId);

    PaymentProcessorInterface public paymentProcessor;
    UserLibraryInterface public userLibrary;

    modifier onlyClient(uint _jobId) {
        if (store.get(jobClient, _jobId) != msg.sender) {
            return;
        }
        _;
    }

    modifier onlyWorker(uint _jobId) {
        if (store.get(jobWorker, _jobId) != msg.sender) {
            return;
        }
        _;
    }

    modifier onlyNotClient(uint _jobId) {
        if (store.get(jobClient, _jobId) == msg.sender) {
            return;
        }
        _;
    }

    modifier onlyJobState(uint _jobId, JobState _jobState) {
        if (store.get(jobState, _jobId) != uint(_jobState)) {
            _emitErrorCode(JOB_CONTROLLER_INVALID_STATE);
            assembly {
                mstore(0, 13003) // JOB_CONTROLLER_INVALID_STATE
                return(0, 32)
            }
        }
        _;
    }

    function JobController(
        Storage _store,
        bytes32 _crate,
        address _roles2Library
    )
    JobDataCore(_store, _crate)
    Roles2LibraryAdapter(_roles2Library)
    public
    {
    }

    function init() auth external returns (uint) {
        return JobDataCore._init();
    }

    function setupEventsHistory(address _eventsHistory) auth external returns (uint) {
        require(_eventsHistory != 0x0);

        _setEventsHistory(_eventsHistory);
        return OK;
    }

    /// @notice Sets contract address that satisfies BoardControllerAccessor interface
    function setBoardController(address _boardController) auth external returns (uint) {
        store.set(boardController, _boardController);
        return OK;
    }

    function setPaymentProcessor(PaymentProcessorInterface _paymentProcessor) auth external returns (uint) {
        paymentProcessor = _paymentProcessor;
        return OK;
    }

    function setUserLibrary(UserLibraryInterface _userLibrary) auth external returns (uint) {
        userLibrary = _userLibrary;
        return OK;
    }


    function calculateLock(address worker, uint _jobId, uint _time, uint _onTop) public view returns (uint) {
        // Lock additional working hour + 10% of resulting amount
        uint rate = store.get(jobOfferRate, _jobId, worker);
        return ((rate * (_time) + _onTop) * 11) / 10;
    }

    function calculateLockAmount(uint _jobId) public view returns (uint) {
        address worker = store.get(jobWorker, _jobId);
        // Lock additional working hour + 10% of resulting amount
        return calculateLockAmountFor(worker, _jobId);
    }

    function calculateLockAmountFor(address worker, uint _jobId) public view returns (uint) {
        uint onTop = store.get(jobOfferOntop, _jobId, worker);
        return calculateLock(worker, _jobId, store.get(jobOfferEstimate, _jobId, worker) + 60, onTop);
    }

    function calculatePaycheck(uint _jobId) public view returns (uint) {
        address worker = store.get(jobWorker, _jobId);
        uint _jobState = _getJobState(_jobId);
        if (_jobState == uint(JobState.FINISHED)) {
            // Means that participants have agreed on job completion,
            // reward should be calculated depending on worker's time spent.
            uint maxEstimatedTime = store.get(jobOfferEstimate, _jobId, worker) + 60;
            uint timeSpent = (store.get(jobFinishTime, _jobId) -
                              store.get(jobStartTime, _jobId) -
                              store.get(jobPausedFor, _jobId)) / 60;
            if (timeSpent > 60 && timeSpent <= maxEstimatedTime) {
                // Worker was doing the job for more than an hour, but less then
                // maximum estimated working time. Release money for the time
                // he has actually worked + "on top" expenses.
                return timeSpent * store.get(jobOfferRate, _jobId, worker) +
                       store.get(jobOfferOntop, _jobId, worker);

            } else if (timeSpent > maxEstimatedTime) {
                // Means worker has gone over maximum estimated time and hasnt't
                // requested more time, which is his personal responsibility, since
                // we're already giving workers additional working hour from start.
                // So we release money for maximum estimated working time + "on top".
                return maxEstimatedTime * store.get(jobOfferRate, _jobId, worker) +
                       store.get(jobOfferOntop, _jobId, worker);

            } else {
                // Worker has completed the job within just an hour, so we
                // release money for the minumum 1 working hour + "on top".
                return 60 * store.get(jobOfferRate, _jobId, worker) +
                       store.get(jobOfferOntop, _jobId, worker);
            }
        } else if (
            _jobState == uint(JobState.STARTED) ||
            _jobState == uint(JobState.PENDING_FINISH)
        ) {
            // Job has been canceled right after start or right before completion,
            // minimum of 1 working hour + "on top" should be released.
            return store.get(jobOfferOntop, _jobId, worker) +
                   store.get(jobOfferRate, _jobId, worker) * 60;
        } else if (
            _jobState == uint(JobState.ACCEPTED) ||
            _jobState == uint(JobState.PENDING_START)
        ) {
            // Job hasn't even started yet, but has been accepted,
            // release just worker "on top" expenses.
            return store.get(jobOfferOntop, _jobId, worker);
        }
    }

    function _isValidEstimate(uint _rate, uint _estimate, uint _ontop) internal pure returns (bool) {
        if (_rate == 0 || _estimate == 0) {
            return false;
        }
        uint prev = 0;
        for (uint i = 1; i <= _estimate + 60; i++) {
            uint curr = prev + _rate;
            if (curr < prev) {
                return false;
            }
            prev = curr;
        }
        return ((prev + _ontop) / 10) * 11 > prev;
    }

    function postJob(
        uint _area,
        uint _category,
        uint _skills,
        uint _defaultPay,
        bytes32 _detailsIPFSHash
    )
    singleOddFlag(_area)
    singleOddFlag(_category)
    hasFlags(_skills)
    public
    returns (uint)
    {
        uint jobId = store.get(jobsCount) + 1;
        store.set(bindStatus, jobId, false);
        store.set(jobsCount, jobId);
        store.set(jobCreatedAt, jobId, now);
        store.set(jobState, jobId, uint(JobState.CREATED));
        store.set(jobClient, jobId, msg.sender);
        store.set(jobSkillsArea, jobId, _area);
        store.set(jobSkillsCategory, jobId, _category);
        store.set(jobSkills, jobId, _skills);
        store.set(jobDefaultPay, jobId, _defaultPay);
        store.set(jobDetailsIPFSHash, jobId, _detailsIPFSHash);
        store.add(clientJobs, bytes32(msg.sender), jobId);

        _emitJobPosted(jobId, msg.sender, _area, _category, _skills, _defaultPay, _detailsIPFSHash, false);
        return OK;
    }

    function postJobOffer(
        uint _jobId,
        uint _rate,
        uint _estimate,
        uint _ontop
    )
    onlyNotClient(_jobId)
    onlyJobState(_jobId, JobState.CREATED)
    public
    returns (uint)
    {
        if (!_isValidEstimate(_rate, _estimate, _ontop)) {
            return _emitErrorCode(JOB_CONTROLLER_INVALID_ESTIMATE);
        }

        if (!_hasSkillsCheck(_jobId)) {
            return _emitErrorCode(JOB_CONTROLLER_INVALID_SKILLS);
        }

        store.set(jobOfferRate, _jobId, msg.sender, _rate);
        store.set(jobOfferEstimate, _jobId, msg.sender, _estimate);
        store.set(jobOfferOntop, _jobId, msg.sender, _ontop);
        store.add(workerJobs, bytes32(msg.sender), _jobId);
        store.add(jobOffers, bytes32(_jobId), msg.sender);

        _emitJobOfferPosted(_jobId, msg.sender, _rate, _estimate, _ontop);
        return OK;
    }

    function _hasSkillsCheck(uint _jobId) internal view returns (bool) {
        return userLibrary.hasSkills(
            msg.sender,
            store.get(jobSkillsArea, _jobId),
            store.get(jobSkillsCategory, _jobId),
            store.get(jobSkills, _jobId)
        );
    }

    function acceptOffer(
        uint _jobId,
        address _worker
    )
    onlyClient(_jobId)
    onlyJobState(_jobId, JobState.CREATED)
    external
    payable
    returns (uint _resultCode)
    {
        if (store.get(jobOfferRate, _jobId, _worker) == 0) {
            return _emitErrorCode(JOB_CONTROLLER_WORKER_RATE_NOT_SET);
        }

        // Maybe incentivize by locking some money from worker?
        store.set(jobWorker, _jobId, _worker);

        require(msg.value == calculateLockAmount(_jobId));

        _resultCode = paymentProcessor.lockPayment.value(msg.value)(bytes32(_jobId), msg.sender);
        if (_resultCode != OK) {
            revert();
        }

        store.set(jobAcceptedAt, _jobId, now);
        store.set(jobState, _jobId, uint(JobState.ACCEPTED));
        _cleanupJobOffers(_jobId, _worker);

        JobController(getEventsHistory()).emitJobOfferAccepted(_jobId, _worker);
        return OK;
    }

    function _cleanupJobOffers(uint _jobId, address _acceptedOffer) private {
        uint _offersCount = store.count(jobOffers, bytes32(_jobId));
        for (uint _offerIdx = 0; _offerIdx < _offersCount; ++_offerIdx) {
            address _offer = store.get(jobOffers, bytes32(_jobId), _offerIdx);
            if (_offer != _acceptedOffer) {
                store.remove(workerJobs, bytes32(_offer), _jobId);
            }
        }
    }

    function startWork(
        uint _jobId
    )
    onlyWorker(_jobId)
    onlyJobState(_jobId, JobState.ACCEPTED)
    external
    returns (uint)
    {
        store.set(jobPendingStartAt, _jobId, now);
        store.set(jobState, _jobId, uint(JobState.PENDING_START));
        return OK;
    }

    function confirmStartWork(
        uint _jobId
    )
    onlyClient(_jobId)
    onlyJobState(_jobId, JobState.PENDING_START)
    external
    returns (uint)
    {
        store.set(jobState, _jobId, uint(JobState.STARTED));
        store.set(jobStartTime, _jobId, now);

        JobController(getEventsHistory()).emitWorkStarted(_jobId, now);
        return OK;
    }

    function pauseWork(
        uint _jobId
    )
    onlyWorker(_jobId)
    onlyJobState(_jobId, JobState.STARTED)
    external
    returns (uint)
    {
        if (store.get(jobPaused, _jobId)) {
            return _emitErrorCode(JOB_CONTROLLER_WORK_IS_ALREADY_PAUSED);
        }

        store.set(jobPaused, _jobId, true);
        store.set(jobPausedAt, _jobId, now);

        JobController(getEventsHistory()).emitWorkPaused(_jobId, now);
        return OK;
    }

    function resumeWork(
        uint _jobId
    )
    onlyWorker(_jobId)
    onlyJobState(_jobId, JobState.STARTED)
    external
    returns (uint _resultCode)
    {
        _resultCode = _resumeWork(_jobId);
        if (_resultCode != OK) {
            return _emitErrorCode(_resultCode);
        }
    }

    function _resumeWork(uint _jobId) internal returns (uint) {
        if (!store.get(jobPaused, _jobId)) {
            return JOB_CONTROLLER_WORK_IS_NOT_PAUSED;
        }
        store.set(jobPaused, _jobId, false);
        store.set(jobPausedFor, _jobId, store.get(jobPausedFor, _jobId) + (now - store.get(jobPausedAt, _jobId)));

        JobController(getEventsHistory()).emitWorkResumed(_jobId, now);
        return OK;
    }

    function addMoreTime(
        uint _jobId,
        uint16 _additionalTime
    )
    onlyClient(_jobId)
    onlyJobState(_jobId, JobState.STARTED)
    external
    payable
    returns (uint)
    {
        require(_additionalTime != 0);

        if (!_setNewEstimate(_jobId, _additionalTime)) {
            revert();
        }
        JobController(getEventsHistory()).emitTimeAdded(_jobId, _additionalTime);
        return OK;
    }

    function _setNewEstimate(uint _jobId, uint16 _additionalTime)
    internal
    returns (bool)
    {
        uint jobPaymentLocked = calculateLockAmount(_jobId);
        store.set(
            jobOfferEstimate,
            _jobId,
            store.get(jobWorker, _jobId),
            store.get(jobOfferEstimate, _jobId, store.get(jobWorker, _jobId)) + _additionalTime
        );

        require(calculateLockAmount(_jobId) - jobPaymentLocked == msg.value);

        return OK == paymentProcessor.lockPayment.value(msg.value)(bytes32(_jobId), msg.sender);
    }

    function endWork(
        uint _jobId
    )
    onlyWorker(_jobId)
    onlyJobState(_jobId, JobState.STARTED)
    external
    returns (uint)
    {
        _resumeWork(_jobId);  // In case worker have forgotten about paused timer
        store.set(jobPendingFinishAt, _jobId, now);
        store.set(jobState, _jobId, uint(JobState.PENDING_FINISH));
        return OK;
    }

    function confirmEndWork(
        uint _jobId
    )
    onlyClient(_jobId)
    onlyJobState(_jobId, JobState.PENDING_FINISH)
    external
    returns (uint)
    {
        store.set(jobFinishTime, _jobId, now);
        store.set(jobState, _jobId, uint(JobState.FINISHED));

        JobController(getEventsHistory()).emitWorkFinished(_jobId, now);
        return OK;
    }

    function cancelJob(
        uint _jobId
    )
    onlyClient(_jobId)
    external
    returns (uint _resultCode)
    {
        uint _jobState = _getJobState(_jobId);
        if (
            _jobState != uint(JobState.ACCEPTED) &&
            _jobState != uint(JobState.PENDING_START) &&
            _jobState != uint(JobState.STARTED) &&
            _jobState != uint(JobState.PENDING_FINISH)
        ) {
            return _emitErrorCode(JOB_CONTROLLER_INVALID_STATE);
        }

        uint payCheck = calculatePaycheck(_jobId);
        address worker = store.get(jobWorker, _jobId);

        _resultCode = paymentProcessor.releasePayment(
            bytes32(_jobId),
            worker,
            payCheck,
            store.get(jobClient, _jobId),
            payCheck,
            0
        );
        if (_resultCode != OK) {
            return _emitErrorCode(_resultCode);
        }

        store.set(jobFinalizedAt, _jobId, _getJobState(_jobId));
        store.set(jobState, _jobId, uint(JobState.FINALIZED));

        JobController(getEventsHistory()).emitJobCanceled(_jobId);
        return OK;
    }

    function releasePayment(
        uint _jobId
    )
    onlyJobState(_jobId, JobState.FINISHED)
    public
    returns (uint _resultCode)
    {
        uint payCheck = calculatePaycheck(_jobId);
        address worker = store.get(jobWorker, _jobId);

        _resultCode = paymentProcessor.releasePayment(
            bytes32(_jobId),
            worker,
            payCheck,
            store.get(jobClient, _jobId),
            payCheck,
            0
        );
        if (_resultCode != OK) {
            return _emitErrorCode(_resultCode);
        }

        store.set(jobFinalizedAt, _jobId, _getJobState(_jobId));
        store.set(jobState, _jobId, uint(JobState.FINALIZED));

        JobController(getEventsHistory()).emitPaymentReleased(_jobId);
        return OK;
    }

    function emitJobPosted(
        uint _jobId,
        address _client,
        uint _skillsArea,
        uint _skillsCategory,
        uint _skills,
        uint _defaultPay,
        bytes32 _detailsIPFSHash,
        bool _bindStatus
    )
    public
    {
        JobPosted(_self(), _jobId, _client, _skillsArea, _skillsCategory, _skills, _defaultPay, _detailsIPFSHash, _bindStatus);
    }

    function emitJobOfferPosted(uint _jobId, address _worker, uint _rate, uint _estimate, uint _ontop) public {
        JobOfferPosted(_self(), _jobId, _worker, _rate, _estimate, _ontop);
    }

    function emitJobOfferAccepted(uint _jobId, address _worker) public {
        JobOfferAccepted(_self(), _jobId, _worker);
    }

    function emitWorkStarted(uint _jobId, uint _at) public {
        WorkStarted(_self(), _jobId, _at);
    }

    function emitWorkPaused(uint _jobId, uint _at) public {
        WorkPaused(_self(), _jobId, _at);
    }

    function emitWorkResumed(uint _jobId, uint _at) public {
        WorkResumed(_self(), _jobId, _at);
    }

    function emitTimeAdded(uint _jobId, uint _time) public {
        TimeAdded(_self(), _jobId, _time);
    }

    function emitWorkFinished(uint _jobId, uint _at) public {
        WorkFinished(_self(), _jobId, _at);
    }

    function emitPaymentReleased(uint _jobId) public {
        PaymentReleased(_self(), _jobId);
    }

    function emitJobCanceled(uint _jobId) public {
        JobCanceled(_self(), _jobId);
    }

    function _getJobState(uint _jobId) private view returns (uint) {
        return uint(store.get(jobState, _jobId));
    }

    function _emitJobPosted(
        uint _jobId,
        address _client,
        uint _skillsArea,
        uint _skillsCategory,
        uint _skills,
        uint _defaultPay,
        bytes32 _detailsIPFSHash,
        bool _bindStatus
    )
    internal
    {
        JobController(getEventsHistory()).emitJobPosted(
            _jobId,
            _client,
            _skillsArea,
            _skillsCategory,
            _skills,
            _defaultPay,
            _detailsIPFSHash,
            _bindStatus
        );
    }

    function _emitJobOfferPosted(
        uint _jobId,
        address _worker,
        uint _rate,
        uint _estimate,
        uint _ontop
    )
    internal
    {
        JobController(getEventsHistory()).emitJobOfferPosted(
            _jobId,
            _worker,
            _rate,
            _estimate,
            _ontop
        );
    }
}
