"use strict";

const BalanceHolder = artifacts.require('./BalanceHolder.sol');
const JobController = artifacts.require('./JobController.sol');
const Mock = artifacts.require('./Mock.sol');
const MultiEventsHistory = artifacts.require('./MultiEventsHistory.sol');
const PaymentGateway = artifacts.require('./PaymentGateway.sol');
const PaymentProcessor = artifacts.require('./PaymentProcessor.sol');
const Roles2LibraryInterface = artifacts.require('./Roles2LibraryInterface.sol');
const Storage = artifacts.require('./Storage.sol');
const UserLibrary = artifacts.require('./UserLibrary.sol');
const BoardController = artifacts.require('./BoardController.sol');
const Roles2Library = artifacts.require('./Roles2Library.sol');

const Asserts = require('./helpers/asserts');
const Promise = require('bluebird');
const Reverter = require('./helpers/reverter');
const eventsHelper = require('./helpers/eventsHelper');

const helpers = require('./helpers/helpers');
const ErrorsNamespace = require('../common/errors')


contract('BoardController', function(accounts) {
  const reverter = new Reverter(web3);
  afterEach('revert', reverter.revert);

  const asserts = Asserts(assert);
  const roles2LibraryInterface = web3.eth.contract(Roles2LibraryInterface.abi).at('0x0');
  const userLibraryInterface = web3.eth.contract(UserLibrary.abi).at('0x0');

  const assertInternalBalance = (address, coinAddress, expectedValue) => {
    return (actualValue) => {
      return paymentGateway.getBalance(address, coinAddress)
      .then(asserts.equal(expectedValue));
    };
  };

  const assertExternalBalance = (address, coinAddress, expectedValue) => {
    return (actualValue) => {
      return paymentGateway.getBalanceOf(address, coinAddress)
      .then(asserts.equal(expectedValue));
    };
  };

  let storage;
  let boardController;
  let jobController;
  let multiEventsHistory;
  let paymentProcessor;
  let userLibrary;
  let paymentGateway;
  let balanceHolder;
  let roles2Library;
  let mock;
  let createBoard;
  let closeBoard;

  const root = accounts[5];
  const moderator = accounts[6];
  const moderator2 = accounts[7];
  const stranger = accounts[9];
  const client = accounts[1];
  const role = 44;
  const boardId = 1;
  const boardName = 'Name';
  const boardDescription = 'Description';
  const boardIpfsHash = "board_ipfs_hash";
  const boardTags = 1;
  const boardTagsArea = 1;
  const boardTagsCategory = 1;
  const jobId = 1;
  const jobArea = 4;
  const jobCategory = 4;
  const jobSkills = 4;
  const jobDefaultPay = 90;
  const jobDetails = 'Job details';

  before('setup', () => {
    return Mock.deployed()
    .then(instance => mock = instance)
    .then(() => MultiEventsHistory.deployed())
    .then(instance => multiEventsHistory = instance)
    .then(() => Storage.deployed())
    .then(instance => storage = instance)
    .then(() => BalanceHolder.deployed())
    .then(instance => balanceHolder = instance)
    .then(() => UserLibrary.deployed())
    .then(instance => userLibrary = instance)
    .then(() => Roles2Library.deployed())
    .then(instance => roles2Library = instance)
    .then(() => PaymentGateway.deployed())
    .then(instance => paymentGateway = instance)
    .then(() => PaymentProcessor.deployed())
    .then(instance => paymentProcessor = instance)
    .then(() => JobController.deployed())
    .then(instance => jobController = instance)
    .then(() => BoardController.deployed())
    .then(instance => boardController = instance)

    .then(() => paymentGateway.setBalanceHolder(balanceHolder.address))
    .then(() => paymentProcessor.setPaymentGateway(paymentGateway.address))
    .then(() => jobController.setPaymentProcessor(paymentProcessor.address))
    .then(() => jobController.setUserLibrary(mock.address))
    .then(() => createBoard = boardController.contract.createBoard.getData(0,0,0,0).slice(0,10))
    .then(() => closeBoard = boardController.contract.closeBoard.getData(0).slice(0,10))
    .then(() => roles2Library.setRootUser(root, true))
    .then(() => roles2Library.addRoleCapability(role, boardController.address, createBoard))
    .then(() => roles2Library.addRoleCapability(role, boardController.address, closeBoard))
    .then(() => roles2Library.addUserRole(moderator, role, {from: root}))
    .then(reverter.snapshot);
  });


  describe('Board creating', () => {
    it('should allow to create a board by moderator', () => {
      return Promise.resolve()
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => boardController.getBoardsCount())
        .then(asserts.equal(1));
    });

    it('should allow to create a board by root', () => {
      return Promise.resolve()
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: root}))
        .then(() => boardController.getBoardsCount())
        .then(asserts.equal(1));
    });

    it('should allow to create a board several times by different moderators', () => {
      return Promise.resolve()
        .then(() => roles2Library.addUserRole(moderator2, role, {from: root}))
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator2}))
        .then(() => boardController.getBoardsCount())
        .then(asserts.equal(2));
    });

    it('should allow to create a board several times by root and moderator', () => {
      return Promise.resolve()
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: root}))
        .then(() => boardController.getBoardsCount())
        .then(asserts.equal(2));
    });

    it.skip('should NOT allow to create a board by strangers', () => {
      return Promise.resolve()
        .then(() => boardController.createBoard.call(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: stranger}))
        .then(asserts.equal(0));
    });

    it.skip('should NOT allow to create a board with negative tags', () => {
      const negativeTags = -1;
      return Promise.resolve()
        .then(() => boardController.createBoard(negativeTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => boardController.getBoardsCount())
        .then(asserts.equal(0));
    });

    it('should NOT allow to create a board with negative area', () => {
      const negativeArea = -1;
      return Promise.resolve()
        .then(() => boardController.createBoard(boardTags, negativeArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => boardController.getBoardsCount())
        .then(asserts.equal(0));
    });

    it('should NOT allow to create a board with negative category', () => {
      const negativeCategory = -1;
      return Promise.resolve()
        .then(() => boardController.createBoard(boardTags, boardTagsArea, negativeCategory, "boardIpfsHash", {from: moderator}))
        .then(() => boardController.getBoardsCount())
        .then(asserts.equal(0));
    });

    it('should NOT allow to create a board without tags', () => {
      const zeroTag = 0;
      return Promise.resolve()
        .then(() => boardController.createBoard(zeroTag, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => boardController.getBoardsCount())
        .then(asserts.equal(0));
    });

    it('should allow to create a board after failed trying', () => {
      const zeroTag = 0;
      return Promise.resolve()
        .then(() => boardController.createBoard(zeroTag, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => boardController.getBoardsCount())
        .then(asserts.equal(1));
    });

    it('should emit "BoardCreated" event', () => {
      return Promise.resolve()
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(tx => eventsHelper.extractEvents(tx, "BoardCreated"))
        .then(events => {
            assert.equal(events.length, 1);
            let boardCreatedEvent = events[0];

            assert.equal(boardCreatedEvent.address, multiEventsHistory.address);
            assert.equal(boardCreatedEvent.event, 'BoardCreated');
            const log = boardCreatedEvent.args;            
            assert.equal(log.self, boardController.address);
            assert.equal(log.boardId.toString(), '1');
            assert.equal(log.boardTags.toString(), boardTags);
            assert.equal(log.boardTagsArea.toString(), boardTagsArea);
            assert.equal(log.boardTagsCategory.toString(), boardTagsCategory);
            // TODO: ahiatsevich: check name/description/ipfshash
        })
    });

  });

  describe('Job binding', () => {

    it('should allow to bind job on board', () => {
      return Promise.resolve()
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => jobController.postJob(jobArea, jobCategory, jobSkills, jobDefaultPay, jobDetails, {from: client}))
        .then(() => boardController.bindJobWithBoard(boardId, jobId))
        .then(() => boardController.getJobStatus(boardId, jobId))
        .then(asserts.equal(true));
    });

    it('should NOT allow to bind job on closed board', () => {
      return Promise.resolve()
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => jobController.postJob(jobArea, jobCategory, jobSkills, jobDefaultPay, jobDetails, {from: client}))
        .then(() => boardController.closeBoard(boardId, {from: moderator}))
        .then(() => boardController.bindJobWithBoard.call(boardId, jobId))
        .then((code) => assert.equal(code, ErrorsNamespace.BOARD_CONTROLLER_BOARD_IS_CLOSED));
    });

    it('should NOT allow to bind binded job on other board', () => {
      const boardId2 = 2;
      return Promise.resolve()
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => jobController.postJob(jobArea, jobCategory, jobSkills, jobDefaultPay, jobDetails, {from: client}))
        .then(() => boardController.bindJobWithBoard(boardId, jobId))
        .then(() => boardController.bindJobWithBoard.call(boardId2, jobId))
        .then((code) => assert.equal(code.toNumber(), ErrorsNamespace.BOARD_CONTROLLER_JOB_IS_ALREADY_BINDED));
    });

    it('should NOT allow to bind binded job on same board twice', () => {
      return Promise.resolve()
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => jobController.postJob(jobArea, jobCategory, jobSkills, jobDefaultPay, jobDetails, {from: client}))
        .then(() => boardController.bindJobWithBoard(boardId, jobId))
        .then(() => boardController.bindJobWithBoard.call(boardId, jobId))
        .then((code) => assert.equal(code.toNumber(), ErrorsNamespace.BOARD_CONTROLLER_JOB_IS_ALREADY_BINDED));
    });

    it('should emit "Job Binded" event', () => {
      return Promise.resolve()
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => jobController.postJob(jobArea, jobCategory, jobSkills, jobDefaultPay, jobDetails, {from: client}))
        .then(() => boardController.bindJobWithBoard(boardId, jobId))
        .then(tx => {
          assert.equal(tx.logs.length, 1);
          assert.equal(tx.logs[0].address, multiEventsHistory.address);
          assert.equal(tx.logs[0].event, 'JobBinded');
          const log = tx.logs[0].args;
          assert.equal(log.self, boardController.address);
          assert.equal(log.jobId.toString(), '1');
          assert.equal(log.boardId.toString(), '1');
          assert.equal(log.status, true);
        })
    });
  });

  describe('User binding', () => {

    it('should allow to bind user on board', () => {
      return Promise.resolve()
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => boardController.bindUserWithBoard(boardId, client))
        .then(() => boardController.getUserStatus(boardId, client))
        .then(asserts.equal(true));
    });

    it('should allow to bind user not only on one board', () => {
      const boardId2 = 2;
      return Promise.resolve()
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => boardController.bindUserWithBoard(boardId, client))
        .then(() => boardController.bindUserWithBoard(boardId2, client))
        .then(() => boardController.getUserStatus(boardId, client))
        .then(asserts.equal(true))
        .then(() => boardController.getUserStatus(boardId2, client))
        .then(asserts.equal(true));
    });

    it('should NOT allow to bind user on closed board', () => {
      return Promise.resolve()
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => boardController.closeBoard(boardId, {from: moderator}))
        .then(() => boardController.bindUserWithBoard.call(boardId, client))
        .then((code) => assert.equal(code, ErrorsNamespace.BOARD_CONTROLLER_BOARD_IS_CLOSED))
    });

    it('should NOT allow to bind binded user on same board twice', () => {
      return Promise.resolve()
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => boardController.bindUserWithBoard(boardId, client))
        .then(() => boardController.bindUserWithBoard.call(boardId, client))
        .then((code) => assert.equal(code, ErrorsNamespace.BOARD_CONTROLLER_USER_IS_ALREADY_BINDED))
    });

    it('should emit "User Binded" event', () => {
      return Promise.resolve()
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => boardController.bindUserWithBoard(boardId, client))
        .then(tx => {
          assert.equal(tx.logs.length, 1);
          assert.equal(tx.logs[0].address, multiEventsHistory.address);
          assert.equal(tx.logs[0].event, 'UserBinded');
          const log = tx.logs[0].args;
          assert.equal(log.self, boardController.address);
          assert.equal(log.user.toString(), client);
          assert.equal(log.boardId.toString(), '1');
          assert.equal(log.status, true);
        })
    });

    it("should allow to unbind user from bound board", async () => {
      return Promise.resolve()
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => boardController.bindUserWithBoard(boardId, client))
        .then(() => boardController.getUserStatus(boardId, client))
        .then(asserts.equal(true))
        .then(() => boardController.unbindUserFromBoard(boardId, client))
        .then(() => boardController.getUserStatus(boardId, client))
        .then(asserts.equal(false))
    })

    it("should not be able to unbind user from not bound board", async () => {
      return Promise.resolve()
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => boardController.getUserStatus(boardId, client))
        .then(asserts.equal(false))
        .then(() => boardController.unbindUserFromBoard(boardId, client))
        .then(() => boardController.getUserStatus(boardId, client))
        .then(asserts.equal(false))
    })

    it('should emit "UserBinded(status=false)" event with when unbind user', () => {
      return Promise.resolve()
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => boardController.bindUserWithBoard(boardId, client))
        .then(() => boardController.unbindUserFromBoard(boardId, client))
        .then(tx => {
          assert.equal(tx.logs.length, 1);
          assert.equal(tx.logs[0].address, multiEventsHistory.address);
          assert.equal(tx.logs[0].event, 'UserBinded');
          const log = tx.logs[0].args;
          assert.equal(log.self, boardController.address);
          assert.equal(log.user.toString(), client);
          assert.equal(log.boardId.toString(), boardId.toString());
          assert.equal(log.status, false);
        })
    });
  });

  describe('Board closing', () => {

    it('should allow to close board', () => {
      return Promise.resolve()
        .then(() => roles2Library.setRootUser(root, true))
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => boardController.closeBoard(boardId, {from: root}))
        .then(() => boardController.getBoardStatus(boardId))
        .then(asserts.equal(false));
    });

    it.skip('should NOT allow to close board not by root', () => {
      return Promise.resolve()
        .then(() => roles2Library.setRootUser(root, true))
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => boardController.closeBoard(boardId, {from: moderator}))
        .then(() => boardController.getBoardStatus.call(boardId))
        .then(asserts.equal(true));
    });

    it('should NOT allow to close board twice', () => {
      return Promise.resolve()
        .then(() => roles2Library.setRootUser(root, true))
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => boardController.closeBoard(boardId, {from: root}))
        .then(() => boardController.closeBoard.call(boardId, {from: root}))
        .then((code) => assert.equal(code, ErrorsNamespace.BOARD_CONTROLLER_BOARD_IS_CLOSED))
    });

    it('should emit "Boaed Closed" event', () => {
      return Promise.resolve()
        .then(() => roles2Library.setRootUser(root, true))
        .then(() => boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", {from: moderator}))
        .then(() => boardController.closeBoard(boardId, {from: root}))
        .then(tx => eventsHelper.extractEvents(tx, "BoardClosed"))
        .then(events => {
            assert.equal(events.length, 1);
            let boardClosedEvent = events[0];

            assert.equal(boardClosedEvent.address, multiEventsHistory.address);
            assert.equal(boardClosedEvent.event, 'BoardClosed');
            const log = boardClosedEvent.args;
            assert.equal(log.self, boardController.address);
            assert.equal(log.boardId.toString(), '1');
            assert.equal(log.status, false);
        })
    });

  });

  describe("board filters", () => {

    context("get all boards", () => {
      it("should return no boards before their creation", async () => {
        assert.equal((await boardController.getBoardsCount.call()).toNumber(), 0)

        const emptyBoardsList = await boardController.getBoards(boardTags, boardTagsArea, boardTagsCategory, 1, 10)
        assert.lengthOf(emptyBoardsList.removeZeros(), 0)
      })

      const otherBoardTag = 5;

      it("should return created boards only if filter conditions are fulfilled", async () => {
        await roles2Library.setRootUser(root, true)
        
        await boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", { from: moderator, })

        assert.lengthOf((await boardController.getBoards.call(boardTags, boardTagsArea, boardTagsCategory, 1, 10)).removeZeros(), 1)
        assert.lengthOf((await boardController.getBoards.call(0, boardTagsArea, boardTagsCategory, 1, 10)).removeZeros(), 0)

        await boardController.createBoard(otherBoardTag, boardTagsArea, boardTagsCategory, "boardIpfsHash", { from: moderator, })

        assert.lengthOf((await boardController.getBoards.call(boardTags, boardTagsArea, boardTagsCategory, 1, 10)).removeZeros(), 2)
      
        const filteredBoardTag = 4
        const otherBoardsList = (await boardController.getBoards.call(filteredBoardTag, boardTagsArea, boardTagsCategory, 1, 10)).removeZeros()        
        assert.lengthOf(otherBoardsList, 1)
      })
    })

    context("get only bound users's boards", () => {

      it("should allow to get users's boards", async () => {
        await roles2Library.setRootUser(root, true)
        
        await boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", { from: moderator, })
        await boardController.bindUserWithBoard(1, moderator)

        assert.lengthOf((await boardController.getBoardsForUser.call(moderator, boardTags, boardTagsArea, boardTagsCategory)).removeZeros(), 1)
        assert.lengthOf((await boardController.getBoardsForUser.call(root, boardTags, boardTagsArea, boardTagsCategory)).removeZeros(), 0)      
      })
      
      it("should allow to get boards for different clients", async () => {
        await roles2Library.setRootUser(root, true)
        
        await boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", { from: moderator, })
        await boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", { from: moderator, })

        assert.equal((await boardController.getBoardsCount.call()).toNumber(), 2)

        await boardController.bindUserWithBoard(1, moderator)
        await boardController.bindUserWithBoard(1, client)
  
        assert.lengthOf((await boardController.getBoardsForUser.call(moderator, boardTags, boardTagsArea, boardTagsCategory)).removeZeros(), 1)
        assert.lengthOf((await boardController.getBoardsForUser.call(client, boardTags, boardTagsArea, boardTagsCategory)).removeZeros(), 1)
      })

      it("should allow to get board details by id", async () => {
        const otherBoardTags = 7
        const otherBoardName = "Second board"
        await roles2Library.setRootUser(root, true)

        await boardController.createBoard(boardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash", { from: moderator, })
        await boardController.createBoard(otherBoardTags, boardTagsArea, boardTagsCategory, "boardIpfsHash2", { from: moderator, })

        const [ ids,, ipfsHashes, tags, ] = await boardController.getBoardsByIds.call([ 1,2, ])
        assert.lengthOf(ids, 2)
        assert.lengthOf(ipfsHashes, 2)
        assert.equal(ids[0], 1)
        assert.equal(ids[1], 2)
        assert.equal(tags[0], boardTags)
        assert.equal(tags[1], otherBoardTags)
      })
    })
  })

});
