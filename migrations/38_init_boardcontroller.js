"use strict";
const BoardController = artifacts.require('./BoardController.sol');
const Roles2Library = artifacts.require('./Roles2Library.sol');
const StorageManager = artifacts.require('./StorageManager.sol');
const MultiEventsHistory = artifacts.require('./MultiEventsHistory.sol');
const JobController = artifacts.require('JobController')
const JobsDataProvider = artifacts.require('JobsDataProvider')

module.exports = deployer => {
    deployer
    .then(() => BoardController.deployed())
    .then(boardController => boardController.setupEventsHistory(MultiEventsHistory.address))
    .then(() => MultiEventsHistory.deployed())
    .then(multiEventsHistory => multiEventsHistory.authorize(BoardController.address))
    .then(() => StorageManager.deployed())
    .then(storageManager => storageManager.giveAccess(BoardController.address, 'BoardController'))
    .then(() => BoardController.deployed())
    .then(boardController => boardController.setJobsDataProvider(JobsDataProvider.address))
    .then(() => JobController.deployed())
    .then(jobController => jobController.setBoardController(BoardController.address)) // setup board controller accessor
    .then(() => console.log("[Migration] BoardController #initialized"))
};
