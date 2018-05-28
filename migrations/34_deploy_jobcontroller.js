"use strict";
const JobController = artifacts.require('./JobController.sol');
const Roles2Library = artifacts.require('./Roles2Library.sol');
const Storage = artifacts.require('./Storage.sol');

module.exports = deployer => {
    deployer.then(async () => {
        await deployer.deploy(JobController, Storage.address, 'JobController', Roles2Library.address)

        let jobController = await JobController.deployed()
        await jobController.init()

        console.log("[Migration] JobController #deployed")
	})
};
