"use strict";

const Mock = artifacts.require('./Mock.sol');
const MultiEventsHistory = artifacts.require('./MultiEventsHistory.sol');
const Roles2Library = artifacts.require('./Roles2Library.sol');
const Roles2LibraryInterface = artifacts.require('./Roles2LibraryInterface.sol');
const User = artifacts.require('./User.sol');
const UserFactory = artifacts.require('./UserFactory.sol');
const UserProxy = artifacts.require('./UserProxy.sol');

const Asserts = require('./helpers/asserts');
const Reverter = require('./helpers/reverter');
const eventsHelper = require('./helpers/eventsHelper');
const Promise = require('bluebird');
const helpers = require('./helpers/helpers');


contract('UserFactory', function(accounts) {
  const reverter = new Reverter(web3);
  afterEach('revert', reverter.revert);

  const asserts = Asserts(assert);
  const recovery = "0xffffffffffffffffffffffffffffffffffffffff";
  const roles2LibraryInterface = web3.eth.contract(Roles2LibraryInterface.abi).at('0x0');
  let mock;
  let multiEventsHistory;
  let roles2Library;
  let userFactory;

  before('setup', () => {
    return Mock.deployed()
    .then(instance => mock = instance)
    .then(() => Roles2Library.deployed())
    .then(instance => roles2Library = instance)
    .then(() => MultiEventsHistory.deployed())
    .then(instance => multiEventsHistory = instance)
    .then(() => UserFactory.deployed())
    .then(instance => userFactory = instance)
    .then(reverter.snapshot);
  });

  describe("Contract setup", () => {

    it('should check auth on setup event history', () => {
      const caller = accounts[1];
      const newAddress = '0xffffffffffffffffffffffffffffffffffffffff';
      return Promise.resolve()
        .then(() => userFactory.setRoles2Library(Mock.address))
        .then(() => mock.expect(
          userFactory.address,
          0,
          roles2LibraryInterface.canCall.getData(
            caller,
            userFactory.address,
            userFactory.contract.setupEventsHistory.getData(0x0).slice(0, 10)
          ), 0
        ))
        .then(() => userFactory.setupEventsHistory(newAddress, {from: caller}))
        .then(helpers.assertExpectations(mock));
    });

    it("should check auth on setup allowed roles", async () => {
      const caller = accounts[1];
      await userFactory.setRoles2Library(Mock.address)
      await mock.expect(
        userFactory.address,
        0,
        roles2LibraryInterface.canCall.getData(
          caller,
          userFactory.address,
          userFactory.contract.addAllowedRoles.getData([]).slice(0, 10)
        ), 0
      )
      await userFactory.addAllowedRoles([10], { from: caller, })
      await helpers.assertExpectations(mock)()
    })

    it("should check auth on removing allowed roles", async () => {
      const caller = accounts[1];

      await userFactory.setRoles2Library(Mock.address)
      await mock.expect(
        userFactory.address,
        0,
        roles2LibraryInterface.canCall.getData(
          caller,
          userFactory.address,
          userFactory.contract.removeAllowedRoles.getData([]).slice(0, 10)
        ), 0
      )
      await userFactory.removeAllowedRoles([10], { from: caller, })
      await helpers.assertExpectations(mock)()
    })

    it("should have pre-installed roles for client, worker and recruiter", async () => {
      const gotRoles = await userFactory.getAllowedRoles()
      const Roles = {
        CLIENT: 1,
        WORKER: 2,
        RECRUITER: 3,
      }
      assert.equal(gotRoles.toString(), [ Roles.CLIENT, Roles.WORKER, Roles.RECRUITER, ].toString())
    })

    it("should add roles to allowed roles", async () => {
      const caller = accounts[0]
      const roles = [ 10,20, ]
      const gotRoles = await userFactory.getAllowedRoles()

      await userFactory.setRoles2Library(Mock.address)
      await mock.expect(
        userFactory.address,
        0,
        roles2LibraryInterface.canCall.getData(
          caller,
          userFactory.address,
          userFactory.contract.addAllowedRoles.getData([]).slice(0, 10)
        ),
        await mock.convertUIntToBytes32(1)
      )
      await userFactory.addAllowedRoles(roles, { from: caller, })
      await helpers.assertExpectations(mock)()
      assert.equal((await userFactory.getAllowedRoles.call()).toString(), Array.prototype.concat.apply(gotRoles, roles).toString())
    })

    it("should remove roles from allowed roles", async () => {
      const caller = accounts[0]
      const ROLE1 = 10
      const ROLE2 = 20
      const roles = [ ROLE1, ROLE2, ]
      const gotRoles = await userFactory.getAllowedRoles()

      await userFactory.setRoles2Library(Mock.address)
      await mock.expect(
        userFactory.address,
        0,
        roles2LibraryInterface.canCall.getData(
          caller,
          userFactory.address,
          userFactory.contract.addAllowedRoles.getData([]).slice(0, 10)
        ),
        await mock.convertUIntToBytes32(1)
      )
      await userFactory.addAllowedRoles(roles, { from: caller, })
      await mock.expect(
        userFactory.address,
        0,
        roles2LibraryInterface.canCall.getData(
          caller,
          userFactory.address,
          userFactory.contract.removeAllowedRoles.getData([]).slice(0, 10)
        ),
        await mock.convertUIntToBytes32(1)
      )
      await userFactory.removeAllowedRoles([ROLE1], { from: caller, })
      await helpers.assertExpectations(mock)()
      assert.equal((await userFactory.getAllowedRoles.call()).toString(), Array.prototype.concat.apply(gotRoles,[ROLE2]).toString())
    })
  });


  describe("User creation", () => {

    it('should NOT check auth on user creation', async () => {
      const caller = accounts[1];
      const owner = accounts[2];
      const roles = [1, 2];
      const expectedSig = helpers.getSig(
        "createUserWithProxyAndRecovery(address,address,uint8[])"
      );

      await userFactory.setRoles2Library(Mock.address)
      await mock.expect(
        userFactory.address,
        0,
        roles2LibraryInterface.canCall.getData(
          caller,
          userFactory.address,
          expectedSig
        ), 0
      )
      try {
        await userFactory.createUserWithProxyAndRecovery(
          owner, recovery, roles, {from: caller}
        )
      } catch (e) {}
      assert.equal((await mock.expectationsLeft.call()).toNumber(), 1)
    });

    it('should THROW if failed to set roles', async () => {
      const caller = accounts[1];
      const owner = accounts[2];
      const roles = [400, 500];

      await userFactory.setRoles2Library(roles2Library.address)
      await asserts.throws(
        userFactory.createUserWithProxyAndRecovery(owner, recovery, roles, { from: caller, })
      )
    });

    it('should create users with roles', async () => {
      const owner = accounts[1];
      const roles = [400, 500];

      await userFactory.setRoles2Library(roles2Library.address)
      await mock.expect(
        userFactory.address,
        0,
        roles2LibraryInterface.canCall.getData(
          accounts[0],
          userFactory.address,
          userFactory.contract.addAllowedRoles.getData([]).slice(0, 10)
        ),
        await mock.convertUIntToBytes32(1)
      )
      await userFactory.addAllowedRoles(roles, { from: accounts[0], })
      const tx = await userFactory.createUserWithProxyAndRecovery(owner, recovery, roles)
      const events = await eventsHelper.extractEvents(tx, "UserCreated")
      assert.equal(events.length, 1);
      assert.equal(events[0].address, multiEventsHistory.address);
      assert.equal(events[0].args.self, userFactory.address);
      assert.equal(events[0].event, 'UserCreated');
      assert.equal(events[0].args.owner, owner);
      assert.equal(events[0].args.roles.length, roles.length);
      assert.equal(events[0].args.recoveryContract, recovery);
      assert.isDefined(events[0].args.user);
      assert.isDefined(events[0].args.proxy);
    });

    it.skip('should create users with skills', () => {
      const owner = accounts[1];
      const roles = [];
      const areas = 4;
      const categories = [1];
      const skills = [1];
      return userFactory.createUserWithProxyAndRecovery(
        owner, recovery, roles, areas, categories, skills
      )
        .then(tx => eventsHelper.extractEvents(tx, "UserCreated"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].args.self, userFactory.address);
          assert.equal(events[0].event, 'UserCreated');
          assert.equal(events[0].args.owner, owner);
          assert.equal(events[0].args.roles.length, 0);
          assert.equal(events[0].args.areas.toString(2), '100');
          assert.equal(events[0].args.categories.length, 1);
          assert.equal(events[0].args.skills.length, 1);
          assert.equal(events[0].args.recoveryContract, recovery);
          assert.notEqual(events[0].args.proxy, undefined);
          assert.notEqual(events[0].args.user, undefined);
        })
    });

    it.skip('should create users with roles and skills', () => {
      const owner = accounts[1];
      const roles = [1, 2];
      const areas = 4;
      const categories = [1];
      const skills = [1];
      return userFactory.createUserWithProxyAndRecovery(
        owner, recovery, roles, areas, categories, skills
      )
        .then(tx => eventsHelper.extractEvents(tx, "UserCreated"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].args.self, userFactory.address);
          assert.equal(events[0].event, 'UserCreated');
          assert.equal(events[0].args.owner, owner);
          assert.equal(events[0].args.roles.length, 2);
          assert.equal(events[0].args.areas.toString(2), '100');
          assert.equal(events[0].args.categories.length, 1);
          assert.equal(events[0].args.skills.length, 1);
          assert.equal(events[0].args.recoveryContract, recovery);
          assert.notEqual(events[0].args.proxy, undefined);
          assert.notEqual(events[0].args.user, undefined);
        })
    });

    it.skip('should create users without roles and skills', () => {
      const owner = accounts[1];
      return userFactory.createUserWithProxyAndRecovery(owner, recovery, [], 0, [], [])
        .then(tx => eventsHelper.extractEvents(tx, "UserCreated"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].event, 'UserCreated');
          assert.equal(events[0].args.owner, owner);
          assert.equal(events[0].args.roles.length, 0);
          assert.equal(events[0].args.areas.toString(), '0');
          assert.equal(events[0].args.categories.length, 0);
          assert.equal(events[0].args.skills.length, 0);
          assert.equal(events[0].args.recoveryContract, recovery);
          assert.notEqual(events[0].args.proxy, undefined);
          assert.notEqual(events[0].args.user, undefined);
        })
    });

    it('should set correct ownerships on user creation', () => {
      const owner = accounts[1];
      let user;
      let proxy;
      return userFactory.createUserWithProxyAndRecovery(owner, recovery, [])
        .then(tx => {
              return Promise.resolve()
              .then(() => User.at(tx.logs[0].args.user))
              .then(_user => user = _user)
              .then(() => UserProxy.at(tx.logs[0].args.proxy))
              .then(_proxy => proxy = _proxy)
              .then(() => user.contractOwner())
        })
        .then(result => assert.equal(result, owner))
        .then(() => proxy.contractOwner())
        .then(result => assert.equal(result, user.address));
    });

    it('should create multiple users', async () => {
      const users = accounts.slice(2, 5);
      const roles = [1, 2, 3, 4, 5];

      await mock.expect(
        userFactory.address,
        0,
        roles2LibraryInterface.canCall.getData(
          accounts[0],
          userFactory.address,
          userFactory.contract.addAllowedRoles.getData([]).slice(0, 10)
        ),
        await mock.convertUIntToBytes32(1)
      )
      await userFactory.addAllowedRoles(roles, { from: accounts[0], })
      await Promise.each(users, u => {
        return userFactory.createUserWithProxyAndRecovery(u, recovery, roles)
          .then(helpers.assertLogs([{
            event: "UserCreated",
            args: {
              owner: u
            }
          }]))
      })
    });

    it.skip('should create users with 250 roles', async () => {
      // TODO: FIXME! does not work with truffle 4.0.0 / solidity 0.4.15 / testrpc 4.0.0+
      const owner = accounts[1];      
      const roles = [...Array(92).keys()].slice(1);

      await mock.expect(
        userFactory.address,
        0,
        roles2LibraryInterface.canCall.getData(
          accounts[0],
          userFactory.address,
          userFactory.contract.addAllowedRoles.getData([]).slice(0, 10)
        ),
        await mock.convertUIntToBytes32(1)
      )
      await userFactory.addAllowedRoles(roles, { from: accounts[0], })
      await userFactory.createUserWithProxyAndRecovery(owner, recovery, roles)
        .then(helpers.assertLogs([{
          address: multiEventsHistory.address,
          event: "UserCreated",
          args: {
            owner: owner,
            recoveryContract: recovery,
            roles: roles,
          }
        }]))
    });

    it.skip('should create users with 250 categories', () => {
      const owner = accounts[1];
      const roles = [1];
      const areas = 1;
      const categories = [...Array(251).keys()].slice(1);
      const skills = [1];
      return userFactory.createUserWithProxyAndRecovery(
          owner, recovery, roles, areas, categories, skills
        )
        .then(helpers.assertLogs([{
          address: multiEventsHistory.address,
          event: "UserCreated",
          args: {
            owner: owner,
            roles: roles,
            areas: 1,
            categories: categories,
            skills: skills,
            recoveryContract: recovery
          }
        }]))
    });

    it.skip('should create users with 250 skills', () => {
      const owner = accounts[1];
      const roles = [1];
      const areas = 1;
      const categories = [1];
      const skills = [...Array(251).keys()].slice(1);
      return userFactory.createUserWithProxyAndRecovery(
          owner, recovery, roles, areas, categories, skills
        )
        .then(helpers.assertLogs([{
          address: multiEventsHistory.address,
          event: "UserCreated",
          args: {
            owner: owner,
            roles: roles,
            areas: 1,
            categories: categories,
            skills: skills,
            recoveryContract: recovery
          }
        }]))
    });

  });

});
