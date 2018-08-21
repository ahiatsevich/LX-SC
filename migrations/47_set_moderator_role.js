"use strict";
const BoardController = artifacts.require('./BoardController.sol');
const JobController = artifacts.require('./JobController.sol');
const Roles2Library = artifacts.require('./Roles2Library.sol');
const Recovery = artifacts.require('Recovery')
const UserFactory = artifacts.require('UserFactory')
const UserRegistry = artifacts.require('UserRegistry')

module.exports = deployer => {
    deployer.then(async () => {
        const boardController = await BoardController.deployed();
        const roles2Library = await Roles2Library.deployed();
        const recovery = await Recovery.deployed();
        const userRegistry = await UserRegistry.deployed()
        const userFactory = await UserFactory.deployed()
        const jobController = await JobController.deployed()

        const Roles = {
            MODERATOR_ROLE: 10,
            USER_REGISTRY_ROLE: 11,
            BOARD_CONTROLLER_JOB_BINDING_ROLE: 91,
        }

        const createBoardSig = boardController.contract.createBoard.getData(0,0,0,0).slice(0,10);
        const closeBoardSig = boardController.contract.closeBoard.getData(0).slice(0,10);
        const recoverUserSig = recovery.contract.recoverUser.getData(0x0, 0x0).slice(0,10);
        const bindUserWithBoardSig = boardController.contract.bindUserWithBoard.getData(0, 0).slice(0,10);
        const bindUserWithBoardByInvitationSig = boardController.contract.bindUserWithBoardByInvitation.getData(0, 0x0, []).slice(0,10);
        const unbindUserFromBoardSig = boardController.contract.unbindUserFromBoard.getData(0, 0x0).slice(0,10);
        const bindJobWithBoardSig = boardController.contract.bindJobWithBoard.getData(0, 0).slice(0,10);

        await roles2Library.addRoleCapability(Roles.MODERATOR_ROLE, BoardController.address, createBoardSig);
        await roles2Library.addRoleCapability(Roles.MODERATOR_ROLE, BoardController.address, closeBoardSig);
        await roles2Library.addRoleCapability(Roles.MODERATOR_ROLE, BoardController.address, bindUserWithBoardSig);
        await roles2Library.addRoleCapability(Roles.MODERATOR_ROLE, BoardController.address, bindUserWithBoardSig);
        await roles2Library.addRoleCapability(Roles.MODERATOR_ROLE, BoardController.address, bindUserWithBoardByInvitationSig);
        await roles2Library.addRoleCapability(Roles.MODERATOR_ROLE, BoardController.address, unbindUserFromBoardSig);
        await roles2Library.addRoleCapability(Roles.MODERATOR_ROLE, Recovery.address, recoverUserSig);

        // NOTE: RIGHTS SHOULD BE GRANTED TO JobController TO BIND POSTED JOB WITH DEFINED BOARD
        await roles2Library.addRoleCapability(Roles.BOARD_CONTROLLER_JOB_BINDING_ROLE, boardController.address, bindJobWithBoardSig);
        await roles2Library.addUserRole(jobController.address, Roles.BOARD_CONTROLLER_JOB_BINDING_ROLE)

        // NOTE: HERE!!!! RIGHTS SHOULD BE GRANTED TO UserFactory TO ACCESS UserRegistry CONTRACT MODIFICATION
		{
			await roles2Library.addUserRole(userFactory.address, Roles.USER_REGISTRY_ROLE)
			{
				const sig = userRegistry.contract.addUserContract.getData(0x0).slice(0,10)
				await roles2Library.addRoleCapability(Roles.USER_REGISTRY_ROLE, userRegistry.address, sig)
			}
		}

        console.log("[Migration] Moderator Role #setup")
	})
};
