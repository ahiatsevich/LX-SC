"use strict";
const UserFactory = artifacts.require('./UserFactory.sol');
const Roles2Library = artifacts.require('./Roles2Library.sol');
const MultiEventsHistory = artifacts.require('./MultiEventsHistory.sol');

module.exports = deployer => {
    const UserFactoryRole = 20;
    const UserRoles = {
        WORKER: 1,
        CLIENT: 2,
        RECRUITER: 3,
    }
    let userFactory;
    let rolesLibrary; 

    deployer
    .then(() => Roles2Library.deployed())
    .then(_roles2Library => rolesLibrary = _roles2Library)
    .then(() => UserFactory.deployed())
    .then(_userFactory => userFactory = _userFactory)
    .then(() => userFactory.setupEventsHistory(MultiEventsHistory.address))
    .then(() => MultiEventsHistory.deployed())
    .then(multiEventsHistory => multiEventsHistory.authorize(UserFactory.address))
    .then(async () => {
        let sig = rolesLibrary.contract.addUserRole.getData(0,[0]).slice(0, 10);
        await rolesLibrary.addRoleCapability(UserFactoryRole, Roles2Library.address, sig);
    })
    .then(() => rolesLibrary.addUserRole(UserFactory.address, UserFactoryRole))
    .then(async () => {
        const userFactory = await UserFactory.deployed()
        await userFactory.addAllowedRoles([UserRoles.WORKER, UserRoles.CLIENT, UserRoles.RECRUITER])
    })

    .then(() => console.log("[Migration] UserFactory #initialized"))
};
