/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 */

pragma solidity ^0.4.18;


import "./base/BitOps.sol";
import "./JobDataCore.sol";


interface BoardControllerAccessor {
    function getJobsBoard(uint _jobId) external view returns (uint);
}


contract JobsDataProvider is JobDataCore {

    function JobsDataProvider(
        Storage _store,
        bytes32 _crate
    )
    JobDataCore(_store, _crate)
    public
    {
        require(OK == JobDataCore._init());
    }

    /// @notice Gets filtered list of jobs ids that fulfill provided parameters
    /// in a paginated way.
    function getJobs(
        uint _jobState,
        uint _skillsArea,
        uint _skillsCategory,
        uint _skills,
        uint _paused,
        uint _fromId,
        uint _maxLen
    )
    public
    view
    returns (uint[] _ids)
    {
        _ids = new uint[](_maxLen);
        uint _pointer;
        for (uint _jobId = _fromId; _jobId < _fromId + _maxLen; ++_jobId) {
            if (_filterJob(_jobId, _jobState, _skillsArea, _skillsCategory, _skills, _paused)) {
                _ids[_pointer] = _jobId;
                _pointer += 1;
            }
        }
    }

    function getJobForClientCount(address _client) public view returns (uint) {
        return store.count(clientJobs, bytes32(_client));
    }

    /// @notice Gets filtered jobs ids for a client where jobs have provided properties
    /// (job state, skills area, skills category, skills, paused)
    function getJobsForClient(
        address _client,
        uint _jobState,
        uint _skillsArea,
        uint _skillsCategory,
        uint _skills,
        uint _paused,
        uint _fromIdx,
        uint _maxLen
    )
    public
    view
    returns (uint[] _ids)
    {
        uint _count = getJobForClientCount(_client);
        require(_fromIdx < _count);
        _maxLen = (_fromIdx + _maxLen <= _count) ? _maxLen : (_count - _fromIdx);
        _ids = new uint[](_maxLen);
        uint _pointer;
        for (uint _idx = _fromIdx; _idx < _fromIdx + _maxLen; ++_idx) {
            uint _jobId = store.get(clientJobs, bytes32(_client), _idx);
            if (_filterJob(_jobId, _jobState, _skillsArea, _skillsCategory, _skills, _paused)) {
                _ids[_pointer] = _jobId;
                _pointer += 1;
            }
        }
    }

    function getJobForWorkerCount(address _worker) public view returns (uint) {
        return store.count(workerJobs, bytes32(_worker));
    }

    /// @notice Gets filtered jobs for a worker
    /// Doesn't inlcude jobs for which a worker had posted an offer but
    /// other worker got the job
    /// @param _jobState a bitmask, job's state; if INT.MAX then jobs with any state will be included in output
    /// @param _paused if job should be paused or not, convertible to bool; if greater than '1' then output includes both states
    function getJobForWorker(
        address _worker,
        uint _jobState,
        uint _skillsArea,
        uint _skillsCategory,
        uint _skills,
        uint _paused,
        uint _fromIdx,
        uint _maxLen
    )
    public
    view
    returns (uint[] _ids)
    {
        uint _count = getJobForWorkerCount(_worker);
        require(_fromIdx < _count);
        _maxLen = (_fromIdx + _maxLen <= _count) ? _maxLen : (_count - _fromIdx);
        _ids = new uint[](_maxLen);
        uint _pointer;
        for (uint _idx = _fromIdx; _idx < _fromIdx + _maxLen; ++_idx) {
            uint _jobId = store.get(workerJobs, bytes32(_worker), _idx);
            if (_filterJob(_jobId, _jobState, _skillsArea, _skillsCategory, _skills, _paused)) {
                _ids[_pointer] = _jobId;
                _pointer += 1;
            }
        }
    }

    function _filterJob(
        uint _jobId,
        uint _jobState,
        uint _skillsArea,
        uint _skillsCategory,
        uint _skills,
        uint _paused
    )
    private
    view
    returns (bool)
    {
        return _hasFlag(store.get(jobState, _jobId), _jobState) &&
            (_paused > 1 ? true : (_toBool(_paused) == store.get(jobPaused, _jobId))) &&
            _hasFlag(store.get(jobSkillsArea, _jobId), _skillsArea) &&
            _hasFlag(store.get(jobSkillsCategory, _jobId), _skillsCategory) &&
            _hasFlag(store.get(jobSkills, _jobId), _skills);
    }

    function _toBool(uint _value) private pure returns (bool) {
        return _value == 1 ? true : false;
    }

    function getJobsCount() public view returns (uint) {
        return store.get(jobsCount);
    }

    uint8 constant JOBS_RESULT_OFFSET = 21;

    /// @notice Gets jobs details in an archived way (too little stack size
    /// for such amount of return values)
    /// @return {
    ///     "_gotIds": "`uint` identifier",
    ///     "_boardId": "`uint` board identifier where job was pinned, '0' if no such board",
    ///     "_client": "client's address",
    ///     "_worker": "worker's address",
    ///     "_skillsArea": "`uint` skills area mask",
    ///     "_skillsCategory": "`uint` skills category mask",
    ///     "_skills": "`uint` skills mask",
    ///     "_detailsIpfs": "`bytes32` details hash",
    ///     "_state": "`uint` job's state, see JobState",
    ///     "_flowType": "`uint` job's workflow type, see WorkflowType enum",
    ///     "_paused": "`bool` paused or not, '1' - paused, '0' - running",
    ///     "_defaultPay": "`uint` job's default pay size for job seekers",
    ///     "_createdAt": "`uint` publishing (creation) timestamp",
    ///     "_acceptedAt": "`uint` an offer has been accepted timestamp",
    ///     "_pendingStartAt": "`uint` pending started timestamp",
    ///     "_startedAt": "`uint` work started timestamp",
    ///     "_pausedAt": "`uint` work's pause timestamp",
    ///     "_pausedFor": "`uint` work's pause duration",
    ///     "_pendingFinishAt": "`uint` pending finish timestamp",
    ///     "_finishedAt": "`uint` work finished timestamp",
    ///     "_finalizedAt": "`uint` paycheck finalized timestamp"
    /// }
    function getJobsByIds(uint[] _jobIds) public view returns (
        bytes32[] _results
    ) {
        BoardControllerAccessor _boardController = BoardControllerAccessor(store.get(boardController));
        _results = new bytes32[](_jobIds.length * JOBS_RESULT_OFFSET);
        for (uint _idx = 0; _idx < _jobIds.length; ++_idx) {
            _results[_idx * JOBS_RESULT_OFFSET + 0] = bytes32(_jobIds[_idx]);
            _results[_idx * JOBS_RESULT_OFFSET + 2] = bytes32(store.get(jobClient, _jobIds[_idx]));
            _results[_idx * JOBS_RESULT_OFFSET + 3] = bytes32(store.get(jobWorker, _jobIds[_idx]));
            _results[_idx * JOBS_RESULT_OFFSET + 4] = bytes32(store.get(jobSkillsArea, _jobIds[_idx]));
            _results[_idx * JOBS_RESULT_OFFSET + 5] = bytes32(store.get(jobSkillsCategory, _jobIds[_idx]));
            _results[_idx * JOBS_RESULT_OFFSET + 6] = bytes32(store.get(jobSkills, _jobIds[_idx]));
            _results[_idx * JOBS_RESULT_OFFSET + 7] = store.get(jobDetailsIPFSHash, _jobIds[_idx]);
            _results[_idx * JOBS_RESULT_OFFSET + 8] = bytes32(store.get(jobState, _jobIds[_idx]));
            _results[_idx * JOBS_RESULT_OFFSET + 9] = bytes32(store.get(jobWorkflowType, _jobIds[_idx]));
            _results[_idx * JOBS_RESULT_OFFSET + 10] = bytes32(store.get(jobPaused, _jobIds[_idx]) ? 1 : 0);
            _results[_idx * JOBS_RESULT_OFFSET + 11] = bytes32(store.get(jobDefaultPay, _jobIds[_idx]));
            _results[_idx * JOBS_RESULT_OFFSET + 12] = bytes32(store.get(jobCreatedAt, _jobIds[_idx]));
            _results[_idx * JOBS_RESULT_OFFSET + 13] = bytes32(store.get(jobAcceptedAt, _jobIds[_idx]));
            _results[_idx * JOBS_RESULT_OFFSET + 14] = bytes32(store.get(jobPendingStartAt, _jobIds[_idx]));
            _results[_idx * JOBS_RESULT_OFFSET + 15] = bytes32(store.get(jobStartTime, _jobIds[_idx]));
            _results[_idx * JOBS_RESULT_OFFSET + 16] = bytes32(store.get(jobPausedAt, _jobIds[_idx]));
            _results[_idx * JOBS_RESULT_OFFSET + 17] = bytes32(store.get(jobPausedFor, _jobIds[_idx]));
            _results[_idx * JOBS_RESULT_OFFSET + 18] = bytes32(store.get(jobPendingFinishAt, _jobIds[_idx]));
            _results[_idx * JOBS_RESULT_OFFSET + 19] = bytes32(store.get(jobFinishTime, _jobIds[_idx]));
            _results[_idx * JOBS_RESULT_OFFSET + 20] = bytes32(store.get(jobFinalizedAt, _jobIds[_idx]));

            if (address(_boardController) != 0x0) {
                _results[_idx * JOBS_RESULT_OFFSET + 1] = bytes32(_boardController.getJobsBoard(_jobIds[_idx]));
            }
        }
    }

    function getJobOffersCount(uint _jobId) public view returns (uint) {
        return store.count(jobOffers, bytes32(_jobId));
    }

    function getJobOffers(uint _jobId, uint _fromIdx, uint _maxLen) public view returns (
        uint _id,
        address[] _workers,
        uint[] _rates,
        uint[] _estimates,
        uint[] _onTops,
        uint[] _offerPostedAt
    ) {
        uint _offersCount = getJobOffersCount(_jobId);
        if (_fromIdx > _offersCount) {
            return;
        }

        _maxLen = (_fromIdx + _maxLen <= _offersCount) ? _maxLen : (_offersCount - _fromIdx);

        _id = _jobId;
        _workers = new address[](_maxLen);
        _rates = new uint[](_maxLen);
        _estimates = new uint[](_maxLen);
        _onTops = new uint[](_maxLen);
        _offerPostedAt = new uint[](_maxLen);
        uint _pointer = 0;

        for (uint _offerIdx = _fromIdx; _offerIdx < _fromIdx + _maxLen; ++_offerIdx) {
            _workers[_pointer] = store.get(jobOffers, bytes32(_jobId), _offerIdx);
            _rates[_pointer] = store.get(jobOfferRate, _jobId, _workers[_pointer]);
            _estimates[_pointer] = store.get(jobOfferEstimate, _jobId, _workers[_pointer]);
            _onTops[_pointer] = store.get(jobOfferOntop, _jobId, _workers[_pointer]);
            _offerPostedAt[_pointer] = store.get(jobOfferPostedAt, _jobId, _workers[_pointer]);
            _pointer += 1;
        }
    }

    function getJobClient(uint _jobId) public view returns (address) {
        return store.get(jobClient, _jobId);
    }

    function getJobWorker(uint _jobId) public view returns (address) {
        return store.get(jobWorker, _jobId);
    }

    function isActivatedState(uint _jobId, uint _jobState) public view returns (bool) {
        uint _flow = store.get(jobWorkflowType, _jobId);
        bool _needsConfirmation = (_flow & WORKFLOW_CONFIRMATION_NEEDED_FLAG) != 0;
        if (_needsConfirmation && 
        _jobState >= JOB_STATE_STARTED
        ) {
            return true;
        }

        if (!_needsConfirmation &&
            _jobState >= JOB_STATE_PENDING_START
        ) {
            return true;
        }
    }

    function getJobSkillsArea(uint _jobId) public view returns (uint) {
        return store.get(jobSkillsArea, _jobId);
    }

    function getJobSkillsCategory(uint _jobId) public view returns (uint) {
        return store.get(jobSkillsCategory, _jobId);
    }

    function getJobSkills(uint _jobId) public view returns (uint) {
        return store.get(jobSkills, _jobId);
    }

    function getJobDetailsIPFSHash(uint _jobId) public view returns (bytes32) {
        return store.get(jobDetailsIPFSHash, _jobId);
    }

    function getJobDefaultPay(uint _jobId) public view returns (uint) {
        return uint(store.get(jobDefaultPay, _jobId));
    }

    function getJobState(uint _jobId) public view returns (uint) {
        return uint(store.get(jobState, _jobId));
    }

    function getFinalState(uint _jobId) public view returns (uint) {
        return store.get(jobFinalizedAt, _jobId);
    }
}
