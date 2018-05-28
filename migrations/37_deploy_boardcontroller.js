"use strict";
const BoardController = artifacts.require('./BoardController.sol');
const Roles2Library = artifacts.require('./Roles2Library.sol');
const Storage = artifacts.require('./Storage.sol');

module.exports = deployer => {
    deployer.deploy(BoardController, Storage.address, 'BoardController', Roles2Library.address)
    .then(() => console.log("[Migration] BoardController #deployed"))
};
