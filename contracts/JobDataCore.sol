/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 */

pragma solidity ^0.4.18;


import "./adapters/StorageAdapter.sol";


contract JobDataCore is StorageAdapter {

	uint constant OK = 1;

    enum JobState { NOT_SET, CREATED, ACCEPTED, PENDING_START, STARTED, PENDING_FINISH, FINISHED, FINALIZED }

    StorageInterface.Address boardController;

    StorageInterface.UInt jobsCount;

    StorageInterface.UIntUIntMapping jobState;
    StorageInterface.UIntAddressMapping jobClient;  // jobId => jobClient
    StorageInterface.UIntAddressMapping jobWorker;  // jobId => jobWorker
    StorageInterface.UIntBytes32Mapping jobDetailsIPFSHash;

    StorageInterface.UIntUIntMapping jobSkillsArea;  // jobId => jobSkillsArea
    StorageInterface.UIntUIntMapping jobSkillsCategory;  // jobId => jobSkillsCategory
    StorageInterface.UIntUIntMapping jobSkills;  // jobId => jobSkills

    StorageInterface.UIntUIntMapping jobCreatedAt;
    StorageInterface.UIntUIntMapping jobAcceptedAt;
    StorageInterface.UIntUIntMapping jobPendingStartAt;
    StorageInterface.UIntUIntMapping jobStartTime;
    StorageInterface.UIntUIntMapping jobPendingFinishAt;
    StorageInterface.UIntUIntMapping jobFinishTime;
    StorageInterface.UIntBoolMapping jobPaused;
    StorageInterface.UIntUIntMapping jobPausedAt;
    StorageInterface.UIntUIntMapping jobPausedFor;

    /// @dev Default pay for a posted job that are recommended for offers
    StorageInterface.UIntUIntMapping jobDefaultPay;  // jobId => default pay size
    StorageInterface.UIntAddressUIntMapping jobOfferRate; // Per minute.
    StorageInterface.UIntAddressUIntMapping jobOfferEstimate; // In minutes.
    StorageInterface.UIntAddressUIntMapping jobOfferOntop; // Getting to the workplace, etc.

    /// @dev mapping(client address => set(job ids))
    StorageInterface.UIntSetMapping clientJobs;
    /// @dev mapping(worker's address => set(job ids))
    StorageInterface.UIntSetMapping workerJobs;
    /// @dev mapping(posted offer job id => set(worker addresses))
    StorageInterface.AddressesSetMapping jobOffers;

    StorageInterface.UIntBoolMapping bindStatus;

    // At which state job has been marked as FINALIZED
    StorageInterface.UIntUIntMapping jobFinalizedAt;


    function JobDataCore(
        Storage _store,
        bytes32 _crate
    )
    StorageAdapter(_store, _crate)
    public
    {
    }

    function _init() internal returns (uint) {
        jobsCount.init("jobsCount");

        jobState.init("jobState");
        jobClient.init("jobClient");
        jobWorker.init("jobWorker");
        jobDetailsIPFSHash.init("jobDetailsIPFSHash");

        jobSkillsArea.init("jobSkillsArea");
        jobSkillsCategory.init("jobSkillsCategory");
        jobSkills.init("jobSkills");


        jobCreatedAt.init("jobCreatedAt");
        jobAcceptedAt.init("jobAcceptedAt");
        jobPendingStartAt.init("jobPendingStartAt");
        jobStartTime.init("jobStartTime");
        jobPendingFinishAt.init("jobPendingFinishAt");
        jobFinishTime.init("jobFinishTime");
        jobPaused.init("jobPaused");
        jobPausedAt.init("jobPausedAt");
        jobPausedFor.init("jobPausedFor");

        jobDefaultPay.init("jobDefaultPay");
        jobOfferRate.init("jobOfferRate");
        jobOfferEstimate.init("jobOfferEstimate");
        jobOfferOntop.init("jobOfferOntop");

        jobFinalizedAt.init("jobFinalizedAt");

        clientJobs.init("clientJobs");
        workerJobs.init("workerJobs");
        jobOffers.init("jobOffers");

        bindStatus.init("bindStatus");
            
        return OK;
	}
}
