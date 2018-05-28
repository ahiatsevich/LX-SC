"use strict";
const ContractsManager = artifacts.require('./ContractsManager.sol');

const MultiEventsHistory = artifacts.require('./MultiEventsHistory.sol');
const BalanceHolder = artifacts.require('./BalanceHolder.sol');
const Recovery = artifacts.require('./Recovery.sol');
const RatingsAndReputationLibrary = artifacts.require('./RatingsAndReputationLibrary.sol');
const IPFSLibrary = artifacts.require('./IPFSLibrary.sol');
const SkillsLibrary = artifacts.require('./SkillsLibrary.sol');
const UserFactory = artifacts.require('./UserFactory.sol');
const UserLibrary = artifacts.require('./UserLibrary.sol');
const PaymentGateway = artifacts.require('./PaymentGateway.sol');
const PaymentProcessor = artifacts.require('./PaymentProcessor.sol');
const JobController = artifacts.require('./JobController.sol');
const JobsDataProvider = artifacts.require('./JobsDataProvider.sol');
const BoardController = artifacts.require('./BoardController.sol');

module.exports = deployer => {
    deployer.then(async () => {
        const contractsManager = await ContractsManager.deployed()

        await contractsManager.addContract(MultiEventsHistory.address, "MultiEventsHistory");
        await contractsManager.addContract(BalanceHolder.address, "BalanceHolder");
        await contractsManager.addContract(Recovery.address, "Recovery");
        await contractsManager.addContract(RatingsAndReputationLibrary.address, "RatingsAndReputationLibrary");
        await contractsManager.addContract(IPFSLibrary.address, "IPFSLibrary");
        await contractsManager.addContract(SkillsLibrary.address, "SkillsLibrary");
        await contractsManager.addContract(UserFactory.address, "UserFactory");
        await contractsManager.addContract(UserLibrary.address, "UserLibrary");
        await contractsManager.addContract(PaymentGateway.address, "PaymentGateway");
        await contractsManager.addContract(PaymentProcessor.address, "PaymentProcessor");
        await contractsManager.addContract(JobController.address, "JobController");
        await contractsManager.addContract(JobsDataProvider.address, "JobsDataProvider");
        await contractsManager.addContract(BoardController.address, "BoardController");

        console.log("[Migration] ContractsManager #setup")
	})
};
