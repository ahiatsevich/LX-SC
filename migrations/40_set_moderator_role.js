"use strict";
const BoardController = artifacts.require('./BoardController.sol');
const Roles2Library = artifacts.require('./Roles2Library.sol');
const Recovery = artifacts.require('Recovery')

module.exports = deployer => {
    deployer.then(async () => {
        const boardController = await BoardController.deployed();
        const roles2Library = await Roles2Library.deployed();
        const recovery = await Recovery.deployed();

        const ModeratorRole = 10;
        const createBoardSig = boardController.contract.createBoard.getData(0,0,0,0).slice(0,10);
        const closeBoardSig = boardController.contract.closeBoard.getData(0).slice(0,10);
        const recoverUserSig = recovery.contract.recoverUser.getData(0x0, 0x0).slice(0,10);

        await roles2Library.addRoleCapability(ModeratorRole, BoardController.address, createBoardSig);
        await roles2Library.addRoleCapability(ModeratorRole, BoardController.address, closeBoardSig);
        await roles2Library.addRoleCapability(ModeratorRole, Recovery.address, recoverUserSig);

        console.log("[Migration] Moderator Role #setup")
	})
};
