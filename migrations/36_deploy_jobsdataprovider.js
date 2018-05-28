"use strict";
const JobsDataProvider = artifacts.require('JobsDataProvider');
const Storage = artifacts.require('Storage');

module.exports = deployer => {
    deployer.then(async () => {
        await deployer.deploy(JobsDataProvider, Storage.address, 'JobController')

        console.log("[Migration] Jobs Data Provider #deployed")
	})
};
