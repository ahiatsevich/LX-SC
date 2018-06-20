"use strict";

const Mock = artifacts.require('./Mock.sol');
const MultiEventsHistory = artifacts.require('./MultiEventsHistory.sol');
const Roles2Library = artifacts.require('./Roles2Library.sol');
const Roles2LibraryInterface = artifacts.require('./Roles2LibraryInterface.sol');
const Storage = artifacts.require('./Storage.sol');
const UserLibrary = artifacts.require('./UserLibrary.sol');

const Asserts = require('./helpers/asserts');
const Reverter = require('./helpers/reverter');
const eventsHelper = require('./helpers/eventsHelper');
const helpers = require('./helpers/helpers');


contract('UserLibrary', function(accounts) {
  const reverter = new Reverter(web3);

  const asserts = Asserts(assert);
  let storage;
  let multiEventsHistory;
  let userLibrary;
  let roles2LibraryInterface = web3.eth.contract(Roles2LibraryInterface.abi).at('0x0');
  let mock;

  const FROM_NON_OWNER = { from: accounts[5] };

  const addFlags = (...flags) => {
    if (flags.length == 1) {
      return flags[0];
    }
    return addFlags(flags[0].add(flags[1]), ...flags.slice(2));
  };

  const partialFlag = helpers.getFlag;
  const fullFlag = helpers.getEvenFlag;
  const allMask = web3.toBigNumber('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
  const partialAndFullFlag = index => partialFlag(index).add(fullFlag(index));

  const equal = (a, b) => {
    return a.valueOf() === b.valueOf();
  };

  const parseBigNumbers = bigs => bigs.map(big => big.toString()).filter(e => e !== '0');

  const assertUserSkills = (user, expectedSkills) => {
    let actualSkills;
    let expSkills;
    return () =>
      userLibrary.getUserSkills(user)
      .then(([areas, categories, skills]) => {
        actualSkills = [areas.toString(), parseBigNumbers(categories), parseBigNumbers(skills)];
        expSkills = [expectedSkills[0].toString(), parseBigNumbers(expectedSkills[1]), parseBigNumbers(expectedSkills[2])];
        assert.deepEqual(actualSkills, expSkills);
      })
      .catch(err => {
        console.log('Actual skills:', actualSkills);
        throw err;
      });
  };

  const assertExpectations = (expected = 0, callsCount = null) => {
    let expectationsCount;
    return () => {
      return mock.expectationsLeft()
      .then(asserts.equal(expected))
      .then(() => mock.expectationsCount())
      .then(result => expectationsCount = result)
      .then(() => mock.callsCount())
      .then(result => asserts.equal(callsCount === null ? expectationsCount : callsCount)(result));
    };
  };

  before('setup', () => {
    return Mock.deployed()
    .then(instance => mock = instance)
    .then(() => Storage.deployed())
    .then(instance => storage = instance)
    .then(() => UserLibrary.deployed())
    .then(instance => userLibrary = instance)
    .then(() => MultiEventsHistory.deployed())
    .then(instance => multiEventsHistory = instance)
    .then(() => userLibrary.setupEventsHistory(multiEventsHistory.address))
    .then(() => multiEventsHistory.authorize(userLibrary.address))
    .then(reverter.snapshot);
  });

  describe("Pre-setup", () => {

    afterEach('revert', reverter.revert);

    it('should check auth on setup event history', () => {
      const caller = accounts[1];
      const newAddress = '0xffffffffffffffffffffffffffffffffffffffff';
      return Promise.resolve()
      .then(() => userLibrary.setRoles2Library(Mock.address))
      .then(() => mock.expect(
        userLibrary.address,
        0,
        roles2LibraryInterface.canCall.getData(
          caller,
          userLibrary.address,
          userLibrary.contract.setupEventsHistory.getData(newAddress).slice(0, 10)
        ), 0)
      )
      .then(() => userLibrary.setupEventsHistory(newAddress, {from: caller}))
      .then(assertExpectations());
    });
  })


  describe('Skills', function() {

    afterEach('revert', reverter.revert);

    describe('SetMany', function() {
      it('should check auth on calling setMany', () => {
        const caller = accounts[1];
        const user = accounts[2];
        const areas = addFlags(partialAndFullFlag(0));
        const categories = [];
        const skills = [];
        const expectedSkills = [ 0, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setRoles2Library(Mock.address))
        .then(() => {
          const expectedSig = helpers.getSig("setMany(address,uint256,uint256[],uint256[])");
          return mock.expect(
            userLibrary.address,
            0,
            roles2LibraryInterface.canCall.getData(
              caller,
              userLibrary.address,
              expectedSig
            ), 0)
          }
        )
        .then(() => userLibrary.setMany(user, areas, categories, skills, {from: caller}))
        .then(assertExpectations())
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should set user areas', () => {
        const user = accounts[1];
        const areas = addFlags(partialAndFullFlag(0));
        const categories = [];
        const skills = [];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setMany(user, areas, categories, skills))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should set different user areas', () => {
        const user = accounts[1];
        const areas = addFlags(partialAndFullFlag(0), partialAndFullFlag(3));
        const categories = [];
        const skills = [];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setMany(user, areas, categories, skills))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should set different user areas ignoring excess categories', () => {
        const user = accounts[1];
        const areas = addFlags(partialAndFullFlag(0), partialAndFullFlag(3));
        const categories = [addFlags(partialAndFullFlag(0))];
        const skills = [];
        const expectedSkills = [ areas, [], skills ];
        return Promise.resolve()
        .then(() => userLibrary.setMany(user, areas, categories, skills))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should set different user areas ignoring excess skills', () => {
        const user = accounts[1];
        const areas = addFlags(partialAndFullFlag(0), partialAndFullFlag(3));
        const categories = [];
        const skills = [addFlags(partialFlag(0))];
        const expectedSkills = [ areas, categories, [] ];
        return Promise.resolve()
        .then(() => userLibrary.setMany(user, areas, categories, skills))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should not set user area with full flag without partial flag', () => {
        const user = accounts[1];
        const areas = addFlags(fullFlag(0));
        const categories = [];
        const skills = [];
        const expectedSkills = [ 0, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setMany(user, areas, categories, skills))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should not set user area with partial flag without categories', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0));
        const categories = [];
        const skills = [];
        const expectedSkills = [ 0, categories, skills ];
        return Promise.resolve()
        .then(() => asserts.throws(userLibrary.setMany(user, areas, categories, skills)))
        .then(() => true);
      });

      it('should set different user areas with partial flag with categories', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0), partialFlag(3));
        const categories = [addFlags(partialAndFullFlag(0)), addFlags(partialAndFullFlag(0))];
        const skills = [];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setMany(user, areas, categories, skills))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should set user categories', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0));
        const categories = [addFlags(partialAndFullFlag(0))];
        const skills = [];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setMany(user, areas, categories, skills))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should set different user categories', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0));
        const categories = [addFlags(partialAndFullFlag(0), partialAndFullFlag(3))];
        const skills = [];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setMany(user, areas, categories, skills))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should not set user categories with partial flag without skills', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0));
        const categories = [addFlags(partialFlag(0))];
        const skills = [];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => asserts.throws(userLibrary.setMany(user, areas, categories, skills)))
        .then(() => true);
      });

      it('should not set user categories with full flag without partial flag', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0));
        const categories = [addFlags(fullFlag(0))];
        const skills = [];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => asserts.throws(userLibrary.setMany(user, areas, categories, skills)))
        .then(() => true);
      });

      it('should not set empty user categories', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0));
        const categories = [0];
        const skills = [];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => asserts.throws(userLibrary.setMany(user, areas, categories, skills)))
        .then(() => true);
      });

      it('should set user skills', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0));
        const categories = [addFlags(partialFlag(0))];
        const skills = [addFlags(helpers.getFlag(0))];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setMany(user, areas, categories, skills))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should set different user skills', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0));
        const categories = [addFlags(partialFlag(0))];
        const skills = [addFlags(helpers.getFlag(0), helpers.getFlag(1))];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setMany(user, areas, categories, skills))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should set user skills with even and odd flags', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0));
        const categories = [addFlags(partialFlag(0))];
        const skills = [addFlags(helpers.getFlag(0), helpers.getEvenFlag(1))];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setMany(user, areas, categories, skills))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should not set user skills for full category', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0));
        const categories = [addFlags(partialAndFullFlag(0))];
        const skills = [addFlags(helpers.getFlag(0))];
        const expectedSkills = [ areas, categories, [] ];
        return Promise.resolve()
        .then(() => userLibrary.setMany(user, areas, categories, skills))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should not set empty user skills', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0));
        const categories = [addFlags(partialFlag(0))];
        const skills = [0];
        const expectedSkills = [ areas, categories, [] ];
        return Promise.resolve()
        .then(() => asserts.throws(userLibrary.setMany(user, areas, categories, skills)))
        .then(() => true);
      });

      it('should set different everything', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0), partialAndFullFlag(3), partialFlag(127));
        const categories = [addFlags(partialFlag(0)), addFlags(partialAndFullFlag(5), partialFlag(10), partialFlag(127))];
        const skills = [addFlags(helpers.getFlag(0), helpers.getFlag(1)), addFlags(helpers.getFlag(10), helpers.getEvenFlag(111)), addFlags(helpers.getEvenFlag(111))];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setMany(user, areas, categories, skills))
        .then(tx => {
            return Promise.resolve()
                .then(() => eventsHelper.extractEvents(tx, "SkillAreasSet"))
                .then(events => assert.equal(events.length, 1))
                .then(() => eventsHelper.extractEvents(tx, "SkillsSet"))
                .then(events => assert.equal(events.length, skills.length))
                .then(() => eventsHelper.extractEvents(tx, "SkillCategoriesSet"))
                .then(events => assert.equal(events.length, categories.length));
        })
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should overwrite different everything', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0), partialAndFullFlag(3), partialFlag(127));
        const categories = [addFlags(partialFlag(0)), addFlags(partialAndFullFlag(5), partialFlag(10), partialFlag(127))];
        const skills = [addFlags(helpers.getFlag(0), helpers.getFlag(1)), addFlags(helpers.getFlag(10), helpers.getEvenFlag(111)), addFlags(helpers.getEvenFlag(111))];
        const areas2 = addFlags(partialFlag(5));
        const categories2 = [addFlags(partialFlag(1), partialAndFullFlag(2))];
        const skills2 = [addFlags(helpers.getFlag(20), helpers.getEvenFlag(122))];
        const expectedSkills = [ areas2, categories2, skills2 ];
        return Promise.resolve()
        .then(() => userLibrary.setMany(user, areas, categories, skills))
        .then(() => userLibrary.setMany(user, areas2, categories2, skills2))
        .then(tx => {
            return Promise.resolve()
                .then(() => eventsHelper.extractEvents(tx, "SkillAreasSet"))
                .then(events => assert.equal(events.length, 1))
                .then(() => eventsHelper.extractEvents(tx, "SkillsSet"))
                .then(events => assert.equal(events.length, skills2.length))
                .then(() => eventsHelper.extractEvents(tx, "SkillCategoriesSet"))
                .then(events => assert.equal(events.length, categories2.length));
        })
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });
    });

    describe('AddMany', function() {
      it('should check auth on calling addMany', () => {
        const caller = accounts[1];
        const user = accounts[2];
        const areas = addFlags(partialAndFullFlag(0));
        const categories = [];
        const skills = [];
        const expectedSkills = [ 0, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setRoles2Library(Mock.address))
        .then(() => {
          const expectedSig = helpers.getSig("addMany(address,uint256,uint256[],uint256[])");
          return mock.expect(
            userLibrary.address,
            0,
            roles2LibraryInterface.canCall.getData(
              caller,
              userLibrary.address,
              expectedSig
            ), 0)
          }
        )
        .then(() => userLibrary.addMany(user, areas, categories, skills, {from: caller}))
        .then(assertExpectations())
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should set user areas', () => {
        const user = accounts[1];
        const areas = addFlags(partialAndFullFlag(0));
        const categories = [];
        const skills = [];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.addMany(user, areas, categories, skills))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should set different user areas', () => {
        const user = accounts[1];
        const areas = addFlags(partialAndFullFlag(0), partialAndFullFlag(3));
        const categories = [];
        const skills = [];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.addMany(user, areas, categories, skills))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should set different user areas ignoring excess categories', () => {
        const user = accounts[1];
        const areas = addFlags(partialAndFullFlag(0), partialAndFullFlag(3));
        const categories = [addFlags(partialAndFullFlag(0))];
        const skills = [];
        const expectedSkills = [ areas, [], skills ];
        return Promise.resolve()
        .then(() => userLibrary.addMany(user, areas, categories, skills))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should set different user areas ignoring excess skills', () => {
        const user = accounts[1];
        const areas = addFlags(partialAndFullFlag(0), partialAndFullFlag(3));
        const categories = [];
        const skills = [addFlags(partialFlag(0))];
        const expectedSkills = [ areas, categories, [] ];
        return Promise.resolve()
        .then(() => userLibrary.addMany(user, areas, categories, skills))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should not set user area with full flag without partial flag', () => {
        const user = accounts[1];
        const areas = addFlags(fullFlag(0));
        const categories = [];
        const skills = [];
        const expectedSkills = [ 0, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.addMany(user, areas, categories, skills))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should not set user area with partial flag without categories', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0));
        const categories = [];
        const skills = [];
        const expectedSkills = [ 0, categories, skills ];
        return Promise.resolve()
        .then(() => asserts.throws(userLibrary.addMany(user, areas, categories, skills)))
        .then(() => true);
      });

      it('should set different user areas with partial flag with categories', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0), partialFlag(3));
        const categories = [addFlags(partialAndFullFlag(0)), addFlags(partialAndFullFlag(0))];
        const skills = [];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.addMany(user, areas, categories, skills))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should set user categories', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0));
        const categories = [addFlags(partialAndFullFlag(0))];
        const skills = [];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.addMany(user, areas, categories, skills))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should set different user categories', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0));
        const categories = [addFlags(partialAndFullFlag(0), partialAndFullFlag(3))];
        const skills = [];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.addMany(user, areas, categories, skills))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should not set user categories with partial flag without skills', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0));
        const categories = [addFlags(partialFlag(0))];
        const skills = [];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => asserts.throws(userLibrary.addMany(user, areas, categories, skills)))
        .then(() => true);
      });

      it('should not set user categories with full flag without partial flag', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0));
        const categories = [addFlags(fullFlag(0))];
        const skills = [];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => asserts.throws(userLibrary.addMany(user, areas, categories, skills)))
        .then(() => true);
      });

      it('should set user skills', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0));
        const categories = [addFlags(partialFlag(0))];
        const skills = [addFlags(helpers.getFlag(0))];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.addMany(user, areas, categories, skills))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should set different user skills', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0));
        const categories = [addFlags(partialFlag(0))];
        const skills = [addFlags(helpers.getFlag(0), helpers.getFlag(1))];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.addMany(user, areas, categories, skills))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should set user skills with even and odd flags', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0));
        const categories = [addFlags(partialFlag(0))];
        const skills = [addFlags(helpers.getFlag(0), helpers.getEvenFlag(1))];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.addMany(user, areas, categories, skills))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should not set user skills for full category', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0));
        const categories = [addFlags(partialAndFullFlag(0))];
        const skills = [addFlags(helpers.getFlag(0))];
        const expectedSkills = [ areas, categories, [] ];
        return Promise.resolve()
        .then(() => userLibrary.addMany(user, areas, categories, skills))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should not set empty user skills', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0));
        const categories = [addFlags(partialFlag(0))];
        const skills = [0];
        const expectedSkills = [ areas, categories, [] ];
        return Promise.resolve()
        .then(() => asserts.throws(userLibrary.addMany(user, areas, categories, skills)))
        .then(() => true);
      });

      it('should set different everything', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0), partialAndFullFlag(3), partialFlag(127));
        const categories = [addFlags(partialFlag(0)), addFlags(partialAndFullFlag(5), partialFlag(10), partialFlag(127))];
        const skills = [addFlags(helpers.getFlag(0), helpers.getFlag(1)), addFlags(helpers.getFlag(10), helpers.getEvenFlag(111)), addFlags(helpers.getEvenFlag(111))];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.addMany(user, areas, categories, skills))
        .then(tx => {
            return Promise.resolve()
                .then(() => eventsHelper.extractEvents(tx, "SkillAreasSet"))
                .then(events => assert.equal(events.length, 1))
                .then(() => eventsHelper.extractEvents(tx, "SkillsSet"))
                .then(events => assert.equal(events.length, skills.length))
                .then(() => eventsHelper.extractEvents(tx, "SkillCategoriesSet"))
                .then(events => assert.equal(events.length, categories.length));
        })
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should add different everything', () => {
        const user = accounts[1];
        const areas = addFlags(partialFlag(0), partialAndFullFlag(3), partialFlag(127));
        const categories = [addFlags(partialFlag(0)), addFlags(partialAndFullFlag(5), partialFlag(10), partialFlag(127))];
        const skills = [addFlags(helpers.getFlag(0), helpers.getFlag(1)), addFlags(helpers.getFlag(10), helpers.getEvenFlag(111)), addFlags(helpers.getEvenFlag(111))];
        const areas2 = addFlags(partialFlag(0));
        const categories2 = [addFlags(partialFlag(0), partialAndFullFlag(2))];
        const skills2 = [addFlags(helpers.getFlag(20))];
        const expectedSkills = [ areas, categories2.concat(categories.slice(1)), skills2.concat(skills.slice(1)) ];
        return Promise.resolve()
        .then(() => userLibrary.setMany(user, areas, categories, skills))
        .then(() => userLibrary.addMany(user, areas2, categories2, skills2))
        .then(tx => {
            return Promise.resolve()
                .then(() => eventsHelper.extractEvents(tx, "SkillAreasSet"))
                .then(events => assert.equal(events.length, 1))
                .then(() => eventsHelper.extractEvents(tx, "SkillsSet"))
                .then(events => assert.equal(events.length, 1))
                .then(() => eventsHelper.extractEvents(tx, "SkillCategoriesSet"))
                .then(events => assert.equal(events.length, 1));
        })
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });
    });

    describe('SetAreas', function() {
      it('should check auth on setting user areas', () => {
        const caller = accounts[1];
        const user = accounts[1];
        const areas = addFlags(partialAndFullFlag(0));
        const categories = [];
        const skills = [];
        const expectedSkills = [ 0, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setRoles2Library(Mock.address))
        .then(() => mock.expect(
          userLibrary.address,
          0,
          roles2LibraryInterface.canCall.getData(
            caller,
            userLibrary.address,
            userLibrary.contract.setAreas.getData(user, areas).slice(0, 10)
          ), 0)
        )
        .then(() => userLibrary.setAreas(user, areas, {from: caller}))
        .then(assertExpectations())
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should set user areas', () => {
        const user = accounts[1];
        const areas = addFlags(partialAndFullFlag(0));
        const categories = [];
        const skills = [];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setAreas(user, areas))
        .then(tx => eventsHelper.extractEvents(tx, "SkillAreasSet"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'SkillAreasSet');
          assert.equal(events[0].args.user, user);
          assert.equal(events[0].args.self, userLibrary.address);
          equal(events[0].args.areas, areas);
        })
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should set different user areas', () => {
        const user = accounts[1];
        const areas = addFlags(partialAndFullFlag(0), partialAndFullFlag(127));
        const categories = [];
        const skills = [];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setAreas(user, areas))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should rewrite user areas', () => {
        const user = accounts[1];
        const areas = addFlags(partialAndFullFlag(0), partialAndFullFlag(127));
        const areas2 = addFlags(partialAndFullFlag(2), partialAndFullFlag(126));
        const categories = [];
        const skills = [];
        const expectedSkills = [ areas2, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setAreas(user, areas))
        .then(() => userLibrary.setAreas(user, areas2))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should remove user areas', () => {
        const user = accounts[1];
        const areas = addFlags(partialAndFullFlag(0), partialAndFullFlag(127));
        const areas2 = 0;
        const categories = [];
        const skills = [];
        const expectedSkills = [ areas2, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setAreas(user, areas))
        .then(() => userLibrary.setAreas(user, areas2))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should not set partial user areas with empty categories', () => {
        const user = accounts[1];
        const areas = addFlags(partialAndFullFlag(0), partialFlag(10));
        const categories = [];
        const skills = [];
        const expectedSkills = [ 0, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setAreas(user, areas))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should set partial user areas with categories', () => {
        const user = accounts[1];
        const area = partialFlag(10);
        const areas = addFlags(partialAndFullFlag(0), area);
        const categories = [addFlags(partialAndFullFlag(15))];
        const skills = [];
        const expectedSkills = [ areas, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setCategories(user, area, categories[0]))
        .then(() => userLibrary.setAreas(user, 0))
        .then(() => userLibrary.setAreas(user, areas))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should not set full user areas without partial flag', () => {
        const user = accounts[1];
        const areas = addFlags(fullFlag(10));
        const categories = [];
        const skills = [];
        const expectedSkills = [ 0, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setAreas(user, areas))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

    });

    describe('SetCategories', function() {
      it('should check auth on setting user categories', () => {
        const caller = accounts[1];
        const user = accounts[1];
        const area = partialFlag(0);
        const categories = [addFlags(partialAndFullFlag(10))];
        const expectedSkills = [ 0, [], [] ];
        return Promise.resolve()
        .then(() => userLibrary.setRoles2Library(Mock.address))
        .then(() => mock.expect(
          userLibrary.address,
          0,
          roles2LibraryInterface.canCall.getData(
            caller,
            userLibrary.address,
            userLibrary.contract.setCategories.getData(user, area, categories[0]).slice(0, 10)
          ), 0)
        )
        .then(() => userLibrary.setCategories(user, area, categories[0], {from: caller}))
        .then(assertExpectations())
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should set user categories', () => {
        const user = accounts[1];
        const area = partialFlag(0);
        const categories = [addFlags(partialAndFullFlag(10))];
        const skills = [];
        const expectedSkills = [ area, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setCategories(user, area, categories[0]))
        .then(tx => {
            return Promise.resolve()
            .then(() => eventsHelper.extractEvents(tx, "SkillAreasSet"))
            .then(events => {
                assert.equal(events.length, 1);

                assert.equal(events[0].address, multiEventsHistory.address);
                assert.equal(events[0].event, 'SkillAreasSet');
                assert.equal(events[0].args.user, user);
                assert.equal(events[0].args.self, userLibrary.address);
                equal(events[0].args.areas, area);
            })
            .then(() => eventsHelper.extractEvents(tx, "SkillCategoriesSet"))
            .then(events => {
                assert.equal(events.length, 1);
                assert.equal(events[0].address, multiEventsHistory.address);
                assert.equal(events[0].event, 'SkillCategoriesSet');
                assert.equal(events[0].args.user, user);
                assert.equal(events[0].args.self, userLibrary.address);
                equal(events[0].args.area, area);
                equal(events[0].args.categories, categories);
            });
        })
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should set different user categories', () => {
        const user = accounts[1];
        const area = partialFlag(0);
        const categories = [addFlags(partialAndFullFlag(10), partialAndFullFlag(127))];
        const skills = [];
        const expectedSkills = [ area, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setCategories(user, area, categories[0]))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should rewrite user categories', () => {
        const user = accounts[1];
        const area = partialFlag(0);
        const categories = [addFlags(partialAndFullFlag(10), partialAndFullFlag(127))];
        const categories2 = [addFlags(partialAndFullFlag(0))];
        const skills = [];
        const expectedSkills = [ area, categories2, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setCategories(user, area, categories[0]))
        .then(() => userLibrary.setCategories(user, area, categories2[0]))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should not remove user categories completely', () => {
        const user = accounts[1];
        const area = partialFlag(0);
        const categories = [addFlags(partialAndFullFlag(10), partialAndFullFlag(127))];
        const categories2 = [0];
        const skills = [];
        const expectedSkills = [ area, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setCategories(user, area, categories[0]))
        .then(() => userLibrary.setCategories(user, area, categories2[0]))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should not set partial user categories with empty skills', () => {
        const user = accounts[1];
        const area = partialFlag(0);
        const categories = [addFlags(partialFlag(10))];
        const skills = [];
        const expectedSkills = [ area, [0], skills ];
        return Promise.resolve()
        .then(() => userLibrary.setCategories(user, area, categories[0]))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should set partial user categories with skills', () => {
        const user = accounts[1];
        const area = partialFlag(10);
        const category = partialFlag(15);
        const categories = [addFlags(partialAndFullFlag(1), category)];
        const categoriesCleared = [addFlags(partialAndFullFlag(2))];
        const skills = [addFlags(helpers.getFlag(11), helpers.getFlag(111))];
        const expectedSkills = [ area, categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setSkills(user, area, category, skills))
        .then(() => userLibrary.setCategories(user, area, categoriesCleared))
        .then(() => userLibrary.setCategories(user, area, categories))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should not set user categories with many areas', () => {
        const user = accounts[1];
        const area = addFlags(partialFlag(0), partialFlag(1));
        const categories = [addFlags(partialAndFullFlag(10))];
        const skills = [];
        const expectedSkills = [ 0, [], skills ];
        return Promise.resolve()
        .then(() => userLibrary.setCategories(user, area, categories[0]))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should not set user categories with full area flags', () => {
        const user = accounts[1];
        const area = partialAndFullFlag(1);
        const categories = [addFlags(partialAndFullFlag(10))];
        const skills = [];
        const expectedSkills = [ 0, [], skills ];
        return Promise.resolve()
        .then(() => userLibrary.setCategories(user, area, categories[0]))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should not set full user categories without partial flag', () => {
        const user = accounts[1];
        const area = partialFlag(1);
        const categories = [addFlags(fullFlag(10))];
        const skills = [];
        const expectedSkills = [ 0, [], skills ];
        return Promise.resolve()
        .then(() => userLibrary.setCategories(user, area, categories[0]))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should add user area when setting user categories', () => {
        const user = accounts[1];
        const area = partialFlag(0);
        const area2 = partialFlag(5);
        const categories = [addFlags(partialAndFullFlag(10)), addFlags(partialAndFullFlag(15))];
        const skills = [];
        const expectedSkills = [ addFlags(area, area2), categories, skills ];
        return Promise.resolve()
        .then(() => userLibrary.setCategories(user, area, categories[0]))
        .then(() => userLibrary.setCategories(user, area2, categories[1]))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

    });

    describe('SetSkills', function() {
      it('should check auth on setting user skills', () => {
        const caller = accounts[1];
        const user = accounts[1];
        const area = partialFlag(0);
        const category = partialFlag(10);
        const skills = [addFlags(helpers.getFlag(15))];
        const expectedSkills = [ 0, [], [] ];
        return Promise.resolve()
        .then(() => userLibrary.setRoles2Library(Mock.address))
        .then(() => mock.expect(
          userLibrary.address,
          0,
          roles2LibraryInterface.canCall.getData(
            caller,
            userLibrary.address,
            userLibrary.contract.setSkills.getData(user, area, category, skills[0]).slice(0, 10)
          ), 0)
        )
        .then(() => userLibrary.setSkills(user, area, category, skills[0], {from: caller}))
        .then(assertExpectations())
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should set user skills', () => {
        const user = accounts[1];
        const area = partialFlag(0);
        const category = partialFlag(10);
        const skills = [addFlags(helpers.getFlag(15))];
        const expectedSkills = [ area, [category], skills ];
        return Promise.resolve()
        .then(() => userLibrary.setSkills(user, area, category, skills[0]))
        .then(tx => {
            return Promise.resolve()
            .then(() => eventsHelper.extractEvents(tx, "SkillAreasSet"))
            .then(events => {
                assert.equal(events.length, 1);
                assert.equal(events[0].address, multiEventsHistory.address);
                assert.equal(events[0].event, 'SkillAreasSet');
                assert.equal(events[0].args.user, user);
                assert.equal(events[0].args.self, userLibrary.address);
                equal(events[0].args.areas, area);
            })
            .then(() => eventsHelper.extractEvents(tx, "SkillCategoriesSet"))
            .then(events => {
                assert.equal(events.length, 1);
                assert.equal(events[0].address, multiEventsHistory.address);
                assert.equal(events[0].event, 'SkillCategoriesSet');
                assert.equal(events[0].args.user, user);
                assert.equal(events[0].args.self, userLibrary.address);
                equal(events[0].args.area, area);
                equal(events[0].args.categories, category);
            })
            .then(() => eventsHelper.extractEvents(tx, "SkillsSet"))
            .then(events => {
                assert.equal(events.length, 1);
                assert.equal(events[0].address, multiEventsHistory.address);
                assert.equal(events[0].event, 'SkillsSet');
                assert.equal(events[0].args.user, user);
                assert.equal(events[0].args.self, userLibrary.address);
                equal(events[0].args.area, area);
                equal(events[0].args.category, category);
                equal(events[0].args.skills, skills);
            });
        })
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should set different user skils', () => {
        const user = accounts[1];
        const area = partialFlag(0);
        const category = partialFlag(10);
        const skills = [addFlags(helpers.getFlag(15), helpers.getEvenFlag(35))];
        const expectedSkills = [ area, [category], skills ];
        return Promise.resolve()
        .then(() => userLibrary.setSkills(user, area, category, skills[0]))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should rewrite user skills', () => {
        const user = accounts[1];
        const area = partialFlag(0);
        const category = partialFlag(10);
        const skills = [addFlags(helpers.getFlag(15), helpers.getEvenFlag(35))];
        const skills2 = [addFlags(helpers.getFlag(2))];
        const expectedSkills = [ area, [category], skills2 ];
        return Promise.resolve()
        .then(() => userLibrary.setSkills(user, area, category, skills[0]))
        .then(() => userLibrary.setSkills(user, area, category, skills2[0]))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should not remove user skills completely', () => {
        const user = accounts[1];
        const area = partialFlag(0);
        const category = partialFlag(10);
        const skills = [addFlags(helpers.getFlag(15), helpers.getEvenFlag(35))];
        const skills2 = [0];
        const expectedSkills = [ area, [category], skills ];
        return Promise.resolve()
        .then(() => userLibrary.setSkills(user, area, category, skills[0]))
        .then(() => userLibrary.setSkills(user, area, category, skills2[0]))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should not set user skills with many areas', () => {
        const user = accounts[1];
        const area = addFlags(partialFlag(0), partialFlag(1));
        const category = partialFlag(10);
        const skills = [addFlags(helpers.getFlag(15))];
        const expectedSkills = [ 0, [], [] ];
        return Promise.resolve()
        .then(() => userLibrary.setSkills(user, area, category, skills[0]))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should not set user skills with full area flags', () => {
        const user = accounts[1];
        const area = partialAndFullFlag(0);
        const category = partialFlag(10);
        const skills = [addFlags(helpers.getFlag(15))];
        const expectedSkills = [ 0, [], [] ];
        return Promise.resolve()
        .then(() => userLibrary.setSkills(user, area, category, skills[0]))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should not set user skills with many categories', () => {
        const user = accounts[1];
        const area = partialFlag(0);
        const category = addFlags(partialFlag(10), partialAndFullFlag(15));
        const skills = [addFlags(helpers.getFlag(15))];
        const expectedSkills = [ 0, [], [] ];
        return Promise.resolve()
        .then(() => userLibrary.setSkills(user, area, category, skills[0]))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should not set user skills with full category flags', () => {
        const user = accounts[1];
        const area = partialFlag(0);
        const category = partialAndFullFlag(10);
        const skills = [addFlags(helpers.getFlag(15))];
        const expectedSkills = [ 0, [], [] ];
        return Promise.resolve()
        .then(() => userLibrary.setSkills(user, area, category, skills[0]))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should add user area when setting user skills', () => {
        const user = accounts[1];
        const area = partialAndFullFlag(0);
        const area2 = partialFlag(5);
        const category = partialFlag(10);
        const skills = [addFlags(helpers.getFlag(15))];
        const expectedSkills = [ addFlags(area, area2), [category], skills ];
        return Promise.resolve()
        .then(() => userLibrary.setAreas(user, area))
        .then(() => userLibrary.setSkills(user, area2, category, skills[0]))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

      it('should add user category when setting user skills', () => {
        const user = accounts[1];
        const area = partialFlag(0);
        const category = partialAndFullFlag(10);
        const category2 = partialFlag(20);
        const skills = [addFlags(helpers.getFlag(15))];
        const expectedSkills = [ area, [addFlags(category, category2)], skills ];
        return Promise.resolve()
        .then(() => userLibrary.setCategories(user, area, category))
        .then(() => userLibrary.setSkills(user, area, category2, skills[0]))
        .then(assertUserSkills(user, expectedSkills))
        .then(() => true);
      });

    });
  });

  describe('Statistics', () => {

    const users = {
      user1: accounts[1],
      user2: accounts[2],
      user3: accounts[3],
      user4: accounts[4],
    }

    var usersCount

    context("Case 1", () => {

      after('revert', reverter.revert);

      before(async () => {
        const areas = [
          addFlags(partialFlag(0), partialAndFullFlag(3),),
          addFlags(partialAndFullFlag(0), partialAndFullFlag(2),),
          addFlags(partialFlag(0), partialFlag(3),),
        ]

        const categories = [
          addFlags(partialFlag(0), partialAndFullFlag(10)), 
          addFlags(partialAndFullFlag(0), partialFlag(10)),
          addFlags(partialFlag(0), partialFlag(10)),
        ];
        const skills = [
          addFlags(helpers.getFlag(0), helpers.getFlag(10)), 
          addFlags(helpers.getFlag(10), helpers.getEvenFlag(111)), 
          addFlags(helpers.getEvenFlag(111)),
        ];

        await userLibrary.setMany(users.user1, areas[0], [categories[0]], [skills[0]])
        await userLibrary.setMany(users.user2, areas[1], [], [])
        await userLibrary.setMany(users.user3, areas[2], [categories[1], categories[2],], skills)

        usersCount = await userLibrary.getUsersCount.call()
      })

      it("(strict) should have '0' users for [full 5th area]", async () => {
        assert.equal(
          (await userLibrary.getStrictUsersByAreaCount(
            partialAndFullFlag(5),
            [],
            [],
            0,
            usersCount 
          ))[0].toNumber(),
          0
        )
      })

      it("(strict) should have '1' user for [full 3d area]", async () => {
        assert.equal(
          (await userLibrary.getStrictUsersByAreaCount(
            partialAndFullFlag(3),
            [],
            [],
            0,
            usersCount 
          ))[0].toNumber(),
          1
        )
      })

      it("(strict) should have '3' users for [partial 0nd area]", async () => {
        assert.equal(
          (await userLibrary.getStrictUsersByAreaCount(
            partialFlag(0),
            [],
            [],
            0,
            usersCount 
          ))[0].toNumber(),
          3
        )
      })

      it("(strict) should have '2' users for [partial 3rd area]:[partial 0 category]:[any skills]", async () => {
        assert.equal(
          (await userLibrary.getStrictUsersByAreaCount(
            partialFlag(3),
            [partialFlag(0)],
            [allMask],
            0,
            usersCount 
          ))[0].toNumber(),
          2
        )
      })

      it("(strict) should have '2' users for [partial 3rd area]:[partial 0 category]:[2**10 + 2*111 skills]", async () => {
        assert.equal(
          (await userLibrary.getStrictUsersByAreaCount(
            partialFlag(3),
            [partialFlag(0)],
            [addFlags(helpers.getFlag(10), helpers.getEvenFlag(111))],
            0,
            usersCount 
          ))[0].toNumber(),
          2
        )
      })

      it("(strict) should have '1' user for [partial 3rd area]:[partial 0 category]:[2**10 + 2*112 skills]", async () => {
        assert.equal(
          (await userLibrary.getStrictUsersByAreaCount(
            partialFlag(3),
            [partialFlag(0)],
            [addFlags(helpers.getFlag(10), helpers.getEvenFlag(112))],
            0,
            usersCount 
          ))[0].toNumber(),
          1
        )
      })

      it("(strict) should have '2' user for [partial 3rd area]:[partial 0 category and partial 10 category]:[any skills]", async () => {
        assert.equal(
          (await userLibrary.getStrictUsersByAreaCount(
            partialFlag(0),
            [partialAndFullFlag(0), partialFlag(10),],
            [allMask, allMask],
            0,
            usersCount 
          ))[0].toNumber(),
          2
        )
      })

      it("(any) should have '0' users for [full 5th area]", async () => {
        assert.equal(
          (await userLibrary.getUsersByAreaCount(
            partialAndFullFlag(5),
            [],
            [],
            0,
            usersCount 
          ))[0].toNumber(),
          0
        )
      })

      it("(any) should have '1' user for [full 3rd area]", async () => {
        assert.equal(
          (await userLibrary.getUsersByAreaCount(
            partialAndFullFlag(3),
            [],
            [],
            0,
            usersCount 
          ))[0].toNumber(),
          1
        )
      })

      it("(any) should have '3' users for [partial 0nd area]", async () => {
        assert.equal(
          (await userLibrary.getUsersByAreaCount(
            partialFlag(0),
            [],
            [],
            0,
            usersCount 
          ))[0].toNumber(),
          3
        )
      })

      it("(any) should have '2' users for [partial 3rd area]:[partial 0 category]:[any skills]", async () => {
        assert.equal(
          (await userLibrary.getUsersByAreaCount(
            partialFlag(3),
            [partialFlag(0)],
            [allMask],
            0,
            usersCount 
          ))[0].toNumber(),
          2
        )
      })

      it("(any) should have '2' users for [partial 3rd area]:[partial 0 category]:[2**10 + 2*111 skills]", async () => {
        assert.equal(
          (await userLibrary.getUsersByAreaCount(
            partialFlag(3),
            [partialFlag(0)],
            [addFlags(helpers.getFlag(10), helpers.getEvenFlag(111))],
            0,
            usersCount 
          ))[0].toNumber(),
          2
        )
      })

      it("(any) should have '1' user for [partial 3rd area]:[partial 0 category]:[2**10 + 2*112 skills]", async () => {
        assert.equal(
          (await userLibrary.getUsersByAreaCount(
            partialFlag(3),
            [partialFlag(0)],
            [addFlags(helpers.getFlag(10), helpers.getEvenFlag(112))],
            0,
            usersCount 
          ))[0].toNumber(),
          1
        )
      })

      it("(any) should have '3' user for [partial 3rd area]:[partial 0 category or partial 10 category]:[any skills]", async () => {
        assert.equal(
          (await userLibrary.getUsersByAreaCount(
            partialFlag(0),
            [partialAndFullFlag(0), partialFlag(10),],
            [allMask, allMask],
            0,
            usersCount 
          ))[0].toNumber(),
          3
        )
      })
    })
  })
});
