"use strict";
const BoardController = artifacts.require('./BoardController.sol');
const StorageManager = artifacts.require('./StorageManager.sol');
const MultiEventsHistory = artifacts.require('./MultiEventsHistory.sol');
const JobController = artifacts.require('JobController')
const JobsDataProvider = artifacts.require('JobsDataProvider')
const UserLibrary = artifacts.require('UserLibrary')

module.exports = deployer => {
    deployer.then(async () => {
        const multiEventsHistory = await MultiEventsHistory.deployed()
        const storageManager = await StorageManager.deployed()
        const boardController = await BoardController.deployed()

        await storageManager.giveAccess(boardController.address, 'BoardController')

        await boardController.setupEventsHistory(multiEventsHistory.address)
        await multiEventsHistory.authorize(BoardController.address)

        await boardController.setJobsDataProvider(JobsDataProvider.address)
        await boardController.setUserLibrary(UserLibrary.address)

        const jobController = await JobController.deployed()
        await jobController.setBoardController(boardController.address)

        console.log("[Migration] BoardController #initialized")
    })
};
