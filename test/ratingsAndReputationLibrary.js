"use strict";

const JobController = artifacts.require('./JobController.sol');
const JobsDataProvider = artifacts.require('./JobsDataProvider.sol');
const Mock = artifacts.require('./Mock.sol');
const MultiEventsHistory = artifacts.require('./MultiEventsHistory.sol');
const PaymentGateway = artifacts.require('./PaymentGateway.sol');
const RatingsAndReputationLibrary = artifacts.require('./RatingsAndReputationLibrary.sol');
const Roles2Library = artifacts.require('./Roles2Library.sol');
const Roles2LibraryInterface = artifacts.require('./Roles2LibraryInterface.sol');
const Storage = artifacts.require('./Storage.sol');
const UserLibrary = artifacts.require('./UserLibrary.sol');
const UserLibraryMock = artifacts.require('./UserLibraryMock.sol');
const UserFactory = artifacts.require('./UserFactory.sol');
const BoardController = artifacts.require('./BoardController.sol');

const BalanceHolder = artifacts.require('./BalanceHolder.sol');
const PaymentProcessor = artifacts.require('./PaymentProcessor.sol');


const Asserts = require('./helpers/asserts');
const Promise = require('bluebird');
const Reverter = require('./helpers/reverter');
const eventsHelper = require('./helpers/eventsHelper');
const helpers = require('./helpers/helpers')
const ErrorsNamespace = require('../common/errors')

contract('RatingsAndReputationLibrary', function(accounts) {
  const reverter = new Reverter(web3);
  afterEach('revert', reverter.revert);

  const asserts = Asserts(assert);

  const client = accounts[1];
  const worker = accounts[2];

  const boardId = 1;
  const boardName = 'Name';
  const boardDescription = 'Description';
  const boardTags = 1;
  const boardArea = 1;
  const boardCategory = 1;

  const SENDER = accounts[1];
  const RolesLibraryEvaluatorRole = 22;
  let storage;
  let mock;
  let jobController;
  let jobsDataProvider;
  let multiEventsHistory;
  let paymentGateway;
  let userLibrary = web3.eth.contract(UserLibrary.abi).at('0x0');
  let ratingsLibrary;
  let roles2LibraryInterface = web3.eth.contract(Roles2LibraryInterface.abi).at('0x0');
  let userFactory;
  let boardController;
  let balanceHolder;
  let paymentProcessor;
  const evaluator = accounts[6];

  const JOB_STATES = {
    NOT_SET: 0,
    CREATED: 1,
    ACCEPTED: 2,
    PENDING_START: 3,
    STARTED: 4,
    PENDING_FINISH: 5,
    FINISHED: 6,
    FINALIZED: 7,
  }

  let FINALIZED_JOB;
  let NOT_FINALIZED_JOB;

  const equal = (a, b) => {
    return a.valueOf() === b.valueOf();
  };

  const p = (...data) => {
    console.log(...data);
  }

  const setupJob = (_jobArea, _jobCategory, _jobSkills, _client=client, _worker=worker) => {
    let jobId;
    const jobArea = helpers.getFlag(_jobArea);
    const jobCategory = helpers.getFlag(_jobCategory);
    const jobSkills = _jobSkills;  // uint

    const roles = [];
    const recovery = "0xffffffffffffffffffffffffffffffffffffffff";

    return Promise.resolve()
    .then(() => userFactory.createUserWithProxyAndRecovery(
      _worker, recovery, roles, jobArea, [jobCategory], [jobSkills]
    ))
    .then(() => jobController.postJob(
      jobArea, jobCategory, jobSkills, 4 /* default pay size */, "Job details", {from: _client}
    ))
    .then(tx => jobId = tx.logs[0].args.jobId)
    .then(() => jobController.postJobOffer(
      jobId, 100, 100, 100, {from: _worker}
    ))
    .then(async () => {
      const payment = await jobController.calculateLockAmountFor.call(_worker, jobId)
      return await jobController.acceptOffer(jobId, _worker, { from: _client, value: payment, })
    })
    .then(() => jobId);
  }

  const finishJob = (jobId, _client=client, _worker=worker) => {
    return Promise.resolve()
    .then(() => jobController.startWork(jobId, {from: _worker}))
    .then(() => jobController.confirmStartWork(jobId, {from: _client}))
    .then(() => jobController.endWork(jobId, {from: _worker}))
    .then(() => jobController.confirmEndWork(jobId, {from: _client}))
    .then(() => jobController.releasePayment(jobId))
    .then(tx => eventsHelper.extractEvents(tx, "PaymentReleased"))
    .then(events => assert.equal(events.length, 1))
    .then(() => jobId);
  }


  before('setup', () => {
    return Mock.deployed()
    .then(instance => mock = instance)
    .then(() => Storage.deployed())
    .then(instance => storage = instance)
    .then(() => MultiEventsHistory.deployed())
    .then(instance => multiEventsHistory = instance)
    .then(() => JobController.deployed())
    .then(instance => jobController = instance)
    .then(() => JobsDataProvider.deployed())
    .then(instance => jobsDataProvider = instance)
    .then(() => UserFactory.deployed())
    .then(instance => userFactory = instance)
    .then(() => BalanceHolder.deployed())
    .then(instance => balanceHolder = instance)
    .then(() => PaymentGateway.deployed())
    .then(instance => paymentGateway = instance)
    .then(() => PaymentProcessor.deployed())
    .then(instance => paymentProcessor = instance)
    .then(() => RatingsAndReputationLibrary.deployed())
    .then(instance => ratingsLibrary = instance)
    .then(() => BoardController.deployed())
    .then(instance => boardController = instance)

    .then(() => paymentGateway.setBalanceHolder(balanceHolder.address))
    .then(() => paymentProcessor.setPaymentGateway(paymentGateway.address))

    .then(() => userFactory.setUserLibrary(UserLibraryMock.address))
    .then(() => jobController.setUserLibrary(mock.address))
    .then(() => jobController.setPaymentProcessor(paymentProcessor.address))
    .then(() => jobController.setBoardController(boardController.address))

    .then(() => ratingsLibrary.setJobController(jobsDataProvider.address))
    .then(() => ratingsLibrary.setUserLibrary(mock.address))
    .then(() => ratingsLibrary.setBoardController(boardController.address))

    .then(() => setupJob(0, 0, JOB_STATES.FINALIZED))
    .then(jobId => finishJob(jobId))  // jobId#1, to test finished jobs
    .then(jobId => FINALIZED_JOB = jobId.toNumber())

    .then(() => setupJob(0, 0, JOB_STATES.FINALIZED))  // jobId#2, to test canceled jobs
    .then(jobId => NOT_FINALIZED_JOB = jobId.toNumber())

    .then(() => boardController.createBoard(boardTags, boardArea, boardCategory, "ipfsHash"))

    .then(() => boardController.bindUserWithBoard(boardId, SENDER))
    .then(() => boardController.bindUserWithBoard(boardId, client))
    .then(() => boardController.bindUserWithBoard(boardId, worker))

    .then(() => boardController.bindJobWithBoard(boardId, FINALIZED_JOB))
    .then(() => boardController.bindJobWithBoard(boardId, NOT_FINALIZED_JOB))
    .then(() => Roles2Library.deployed())
    .then(rolesLibrary => rolesLibrary.addUserRole(evaluator, RolesLibraryEvaluatorRole))
    .then(() => mock.resetCallsCount())
    .then(reverter.snapshot);
  });


  describe('Contract setup', () => {

    it('should check auth on setup events history', () => {
      const caller = accounts[1];
      const newAddress = '0xffffffffffffffffffffffffffffffffffffffff';
      return Promise.resolve()
      .then(() => ratingsLibrary.setRoles2Library(Mock.address))
      .then(() => mock.expect(
        ratingsLibrary.address,
        0,
        roles2LibraryInterface.canCall.getData(
          caller,
          ratingsLibrary.address,
          ratingsLibrary.contract.setupEventsHistory.getData(newAddress).slice(0, 10)
        ), 0)
      )
      .then(() => ratingsLibrary.setupEventsHistory(newAddress, {from: caller}))
      .then(helpers.assertExpectations(mock));
    });

    it('should check auth on setup user library', () => {
      const caller = accounts[1];
      const newAddress = '0xffffffffffffffffffffffffffffffffffffffff';
      return Promise.resolve()
      .then(() => ratingsLibrary.setRoles2Library(Mock.address))
      .then(() => mock.expect(
        ratingsLibrary.address,
        0,
        roles2LibraryInterface.canCall.getData(
          caller,
          ratingsLibrary.address,
          ratingsLibrary.contract.setUserLibrary.getData(newAddress).slice(0, 10)
        ), 0)
      )
      .then(() => ratingsLibrary.setUserLibrary(newAddress, {from: caller}))
      .then(helpers.assertExpectations(mock));
    });

    it('should check auth on setup job controller', () => {
      const caller = accounts[1];
      const newAddress = '0xffffffffffffffffffffffffffffffffffffffff';
      return Promise.resolve()
      .then(() => ratingsLibrary.setRoles2Library(Mock.address))
      .then(() => mock.expect(
        ratingsLibrary.address,
        0,
        roles2LibraryInterface.canCall.getData(
          caller,
          ratingsLibrary.address,
          ratingsLibrary.contract.setJobController.getData(newAddress).slice(0, 10)
        ), 0)
      )
      .then(() => ratingsLibrary.setJobController(newAddress, {from: caller}))
      .then(helpers.assertExpectations(mock));
    });

  });


  describe('User rating', () => {

    it('should NOT be able to set invalid user rating', () => {
      const ratings = [-1, 0, 11, 100500];
      const address = '0xffffffffffffffffffffffffffffffffffffffff';
      return Promise.each(ratings, rating => {
        return ratingsLibrary.setUserRating(address, rating, {from: SENDER})
        .then(() => ratingsLibrary.getUserRating(SENDER, address))
        .then(asserts.equal(0));
      });
    });

    it('should have "RATING_AND_REPUTATION_INVALID_RATING" code when invalid user rating set', () => {
      const rating = 55;
      const address = '0xffffffffffffffffffffffffffffffffffffffff';
      return Promise.resolve()
      .then(() => ratingsLibrary.setUserRating.call(address, rating, {from: SENDER}))
      .then(code => assert.equal(code.toNumber(), ErrorsNamespace.RATING_AND_REPUTATION_INVALID_RATING))
      .then(() => ratingsLibrary.setUserRating(address, rating, {from: SENDER}))
      .then(tx => {
        assert.equal(tx.logs.length, 1)
        assert.equal(tx.logs[0].event, "ErrorCode")
      })
    });

    it('should NOT rewrite to invalid user rating', () => {
      const rating1 = 5;
      const rating2 = 11;
      const address = '0xffffffffffffffffffffffffffffffffffffffff';
      return ratingsLibrary.setUserRating(address, rating1, {from: SENDER})
      .then(() => ratingsLibrary.setUserRating(address, rating2, {from: SENDER}))
      .then(() => ratingsLibrary.getUserRating(SENDER, address))
      .then(asserts.equal(rating1));
    });

    it('should NOT rewrite to invalid user rating after rewriting', () => {
      const rating1 = 5;
      const rating2 = 3;
      const rating3 = 11;
      const address = '0xffffffffffffffffffffffffffffffffffffffff';
      return ratingsLibrary.setUserRating(address, rating1, {from: SENDER})
      .then(() => ratingsLibrary.setUserRating(address, rating2, {from: SENDER}))
      .then(() => ratingsLibrary.setUserRating(address, rating3, {from: SENDER}))
      .then(() => ratingsLibrary.getUserRating(SENDER, address))
      .then(asserts.equal(rating2));
    });

    it('should rewrite user rating after failed rewriting attempt', () => {
      const rating1 = 5;
      const rating2 = 11;
      const rating3 = 6;
      const address = '0xffffffffffffffffffffffffffffffffffffffff';
      return ratingsLibrary.setUserRating(address, rating1, {from: SENDER})
      .then(() => ratingsLibrary.setUserRating(address, rating2, {from: SENDER}))
      .then(() => ratingsLibrary.setUserRating(address, rating3, {from: SENDER}))
      .then(() => ratingsLibrary.getUserRating(SENDER, address))
      .then(asserts.equal(rating3));
    });

    it('should rewrite user rating', () => {
      const rating1 = 5;
      const rating2 = 6;
      const address = '0xffffffffffffffffffffffffffffffffffffffff';
      return ratingsLibrary.setUserRating(address, rating1, {from: SENDER})
      .then(() => ratingsLibrary.setUserRating(address, rating2, {from: SENDER}))
      .then(() => ratingsLibrary.getUserRating(SENDER, address))
      .then(asserts.equal(rating2));
    });

    it('should store user rating for different addresses', () => {
      const rating1 = 5;
      const rating2 = 6;
      const address1 = '0xffffffffffffffffffffffffffffffffffffffff';
      const address2 = '0xffffffffffffffffffffffffffffffffffffff00';
      return ratingsLibrary.setUserRating(address1, rating1, {from: SENDER})
      .then(() => ratingsLibrary.setUserRating(address2, rating2, {from: SENDER}))
      .then(() => ratingsLibrary.getUserRating(SENDER, address1))
      .then(asserts.equal(rating1))
      .then(() => ratingsLibrary.getUserRating(SENDER, address2))
      .then(asserts.equal(rating2));
    });

    it('should store user rating from different raters', () => {
      const sender2 = accounts[3];
      const rating1 = 5;
      const rating2 = 6;
      const address = '0xffffffffffffffffffffffffffffffffffffffff';
      return ratingsLibrary.setUserRating(address, rating1, {from: SENDER})
      .then(() => ratingsLibrary.setUserRating(address, rating2, {from: sender2}))
      .then(() => ratingsLibrary.getUserRating(SENDER, address))
      .then(asserts.equal(rating1))
      .then(() => ratingsLibrary.getUserRating(sender2, address))
      .then(asserts.equal(rating2));
    });

    it('should emit "UserRatingGiven" event when user rating set', () => {
      const rating = 5;
      const address = '0xffffffffffffffffffffffffffffffffffffffff';
      return ratingsLibrary.setUserRating(address, rating, {from: SENDER})
      .then(tx => eventsHelper.extractEvents(tx, "UserRatingGiven"))
      .then(events => {
        assert.equal(events.length, 1);
        assert.equal(events[0].address, multiEventsHistory.address);
        assert.equal(events[0].args.self, ratingsLibrary.address);
        assert.equal(events[0].event, 'UserRatingGiven');
        assert.equal(events[0].args.rater, SENDER);
        assert.equal(events[0].args.to, address);
        assert.equal(events[0].args.rating, rating);
      });
    });

    it('should set user rating from multiple accounts', () => {
      const raters = accounts.slice(1, 4);
      const rating = 5;
      const address = '0xffffffffffffffffffffffffffffffffffffffff';
      return Promise.each(raters, r => {
        return ratingsLibrary.setUserRating(address, rating, {from: r})
        .then(() => ratingsLibrary.getUserRating(r, address))
        .then(asserts.equal(5));
      });
    });

  });

  describe('Board rating', () => {

    it('should NOT be able to set invalid board rating', () => {
      const ratings = [-1, 0, 11, 100500];
      return Promise.each(ratings, rating => {
        return ratingsLibrary.setBoardRating(boardId, rating, {from: SENDER})
        .then(() => ratingsLibrary.getBoardRating(SENDER, boardId))
        .then(asserts.equal(0));
      });
    });

    it('should have "BoardRatingGiven" event when invalid board rating set', () => {
      const rating = 55;
      return Promise.resolve()
      .then(() => ratingsLibrary.setBoardRating.call(boardId, rating, {from: SENDER}))
      .then(code => assert.equal(code.toNumber(), ErrorsNamespace.RATING_AND_REPUTATION_INVALID_RATING))
      .then(() => ratingsLibrary.setBoardRating(boardId, rating, {from: SENDER}))
      .then(tx => {
        assert.equal(tx.logs.length, 1)
        assert.equal(tx.logs[0].event, "ErrorCode")
      })
    });

    it('should NOT rewrite to invalid board rating', () => {
      const rating1 = 5;
      const rating2 = 11;
      return ratingsLibrary.setBoardRating(boardId, rating1, {from: SENDER})
      .then(() => ratingsLibrary.setBoardRating(boardId, rating2, {from: SENDER}))
      .then(() => ratingsLibrary.getBoardRating(SENDER, boardId))
      .then(asserts.equal(rating1));
    });

    it('should NOT rewrite to invalid board rating after rewriting', () => {
      const rating1 = 5;
      const rating2 = 3;
      const rating3 = 11;
      return ratingsLibrary.setBoardRating(boardId, rating1, {from: SENDER})
      .then(() => ratingsLibrary.setBoardRating(boardId, rating2, {from: SENDER}))
      .then(() => ratingsLibrary.setBoardRating(boardId, rating3, {from: SENDER}))
      .then(() => ratingsLibrary.getBoardRating(SENDER, boardId))
      .then(asserts.equal(rating2));
    });

    it('should rewrite board rating after failed rewriting attempt', () => {
      const rating1 = 5;
      const rating2 = 11;
      const rating3 = 6;
      return ratingsLibrary.setBoardRating(boardId, rating1, {from: SENDER})
      .then(() => ratingsLibrary.setBoardRating(boardId, rating2, {from: SENDER}))
      .then(() => ratingsLibrary.setBoardRating(boardId, rating3, {from: SENDER}))
      .then(() => ratingsLibrary.getBoardRating(SENDER, boardId))
      .then(asserts.equal(rating3));
    });

    it('should rewrite board rating', () => {
      const rating1 = 5;
      const rating2 = 6;
      return ratingsLibrary.setBoardRating(boardId, rating1, {from: SENDER})
      .then(() => ratingsLibrary.setBoardRating(boardId, rating2, {from: SENDER}))
      .then(() => ratingsLibrary.getBoardRating(SENDER, boardId))
      .then(asserts.equal(rating2));
    });

    it('should store board rating for different boardIdes', () => {
      const boardId2 = 2;
      const rating1 = 5;
      const rating2 = 6;
      return boardController.createBoard(boardTags, boardArea, boardCategory, "ipfsHash")
      .then(() => boardController.bindUserWithBoard(boardId2, SENDER))
      .then(() => ratingsLibrary.setBoardRating(boardId, rating1, {from: SENDER}))
      .then(() => ratingsLibrary.setBoardRating(boardId2, rating2, {from: SENDER}))
      .then(() => ratingsLibrary.getBoardRating(SENDER, boardId))
      .then(asserts.equal(rating1))
      .then(() => ratingsLibrary.getBoardRating(SENDER, boardId2))
      .then(asserts.equal(rating2));
    });

    it('should NOT allow to rate board not by board member', () => {
      const stranger = accounts[8];
      const rating = 5;
      return ratingsLibrary.setBoardRating(boardId, rating, {from: stranger})
      .then(() => ratingsLibrary.getBoardRating(stranger, boardId))
      .then(asserts.equal(0))
    });

    it('should store board rating from different raters', () => {
      const sender2 = accounts[3];
      const rating1 = 5;
      const rating2 = 6;
      return ratingsLibrary.setBoardRating(boardId, rating1, {from: SENDER})
      .then(() => boardController.bindUserWithBoard(boardId, sender2))
      .then(() => ratingsLibrary.setBoardRating(boardId, rating2, {from: sender2}))
      .then(() => ratingsLibrary.getBoardRating(SENDER, boardId))
      .then(asserts.equal(rating1))
      .then(() => ratingsLibrary.getBoardRating(sender2, boardId))
      .then(asserts.equal(rating2));
    });

    it('should emit "BoardRatingGiven" event when board rating set', () => {
      const rating = 5;
      return ratingsLibrary.setBoardRating(boardId, rating, {from: SENDER})
      .then(tx => eventsHelper.extractEvents(tx, "BoardRatingGiven"))
      .then(events => {
        assert.equal(events.length, 1);
        assert.equal(events[0].boardId, multiEventsHistory.boardId);
        assert.equal(events[0].event, 'BoardRatingGiven');
        assert.equal(events[0].args.rater, SENDER);
        assert.equal(events[0].args.to, boardId);
        assert.equal(events[0].args.rating, rating);
      });
    });

    it('should set board rating from multiple accounts', () => {
      const raters = accounts.slice(1, 4);
      const rating = 5;
      return Promise.each(raters, r => {
        return boardController.bindUserWithBoard(boardId, r)
        .then(() => ratingsLibrary.setBoardRating(boardId, rating, {from: r}))
        .then(() => ratingsLibrary.getBoardRating(r, boardId))
        .then(asserts.equal(5));
      });
    });

  });

  describe('Job rating', () => {

    it('should NOT set invalid job rating', () => {
      const ratings = [-1, 0, 11, 100500];
      const jobId = FINALIZED_JOB;
      return Promise.each(ratings, rating => {
        return Promise.resolve()
        .then(() => ratingsLibrary.setJobRating.call(worker, rating, jobId, {from: client}))
        .then(code => assert.equal(code.toNumber(), ErrorsNamespace.RATING_AND_REPUTATION_INVALID_RATING))
        .then(() => ratingsLibrary.setJobRating(worker, rating, jobId, {from: client}))
        .then(tx => {
          assert.equal(tx.logs.length, 1)
          assert.equal(tx.logs[0].event, "ErrorCode")
        })
        .then(() => ratingsLibrary.getJobRating(worker, jobId))
        .then(tx => {
          assert.equal(tx[1], 0);
          assert.equal(tx[0], 0);
        })
        .then(() => helpers.assertExpectations(mock));
      })
    });

    it("should NOT allow to rate a job if it's not at FINALIZED state", () => {
      const jobId = NOT_FINALIZED_JOB;
      const rating = 5;
      return Promise.resolve()
      .then(() => ratingsLibrary.setJobRating.call(
        worker, rating, jobId, {from: client}
      ))
      .then(code => assert.equal(code.toNumber(), ErrorsNamespace.RATING_AND_REPUTATION_CANNOT_SET_RATING))
    });

    it("should NOT allow to rate a job if already rated", () => {
      const jobId = FINALIZED_JOB;
      const rating = 5;
      return Promise.resolve()
      .then(() => ratingsLibrary.setJobRating(
        worker, rating, jobId, {from: client}
      ))
      .then(() => ratingsLibrary.setJobRating.call(
        worker, rating, jobId, {from: client}
      ))
      .then(code => assert.equal(code.toNumber(), ErrorsNamespace.RATING_AND_REPUTATION_RATING_IS_ALREADY_SET))
    });

    it("should allow to rate a job after failed attempt", () => {
      const jobId = FINALIZED_JOB;
      const rating = 5;
      const incorrectRating = -5;
      return Promise.resolve()
      .then(() => ratingsLibrary.setJobRating(
        worker, incorrectRating, jobId, {from: client}
      ))
      .then(() => ratingsLibrary.setJobRating.call(
        worker, rating, jobId, {from: client}
      ))
      .then(code => assert.equal(code.toNumber(), ErrorsNamespace.OK))
    });

    it("should NOT rate non-existent job", () => {
      const jobId = 3;
      const rating = 5;
      return Promise.resolve()
      .then(() => ratingsLibrary.setJobRating.call(
        worker, rating, jobId, {from: client}
      ))
      .then(code => assert.equal(code.toNumber(), ErrorsNamespace.RATING_AND_REPUTATION_CANNOT_SET_RATING))
    });

    it('should NOT allow to rate a job with worker not by client', () => {
      const jobId = FINALIZED_JOB;
      const rating = 5;
      return Promise.resolve()
      .then(() => ratingsLibrary.setJobRating.call(
        worker, rating, jobId, {from: accounts[9]}
      ))
      .then(code => assert.equal(code.toNumber(), ErrorsNamespace.RATING_AND_REPUTATION_CANNOT_SET_RATING))
    });

    it('should NOT allow to rate a job with client not by worker', () => {
      const jobId = FINALIZED_JOB;
      const rating = 5;
      return Promise.resolve()
      .then(() => ratingsLibrary.setJobRating.call(
        client, rating, jobId, {from: accounts[9]}
      ))
      .then(code => assert.equal(code.toNumber(), ErrorsNamespace.RATING_AND_REPUTATION_CANNOT_SET_RATING))
    });

    it('should allow to rate a job with worker by client', () => {
      const jobId = FINALIZED_JOB;
      const rating = 1;
      return Promise.resolve()
      .then(() => ratingsLibrary.setJobRating.call(
        worker, rating, jobId, {from: client}
      ))
      .then(code => assert.equal(code.toNumber(), ErrorsNamespace.OK))
    });

    it('should allow to rate a job with client by worker', () => {
      const jobId = FINALIZED_JOB;
      const rating = 3;
      return Promise.resolve()
      .then(() => ratingsLibrary.setJobRating.call(
        client, rating, jobId, {from: worker}
      ))
      .then(code => assert.equal(code.toNumber(), ErrorsNamespace.OK))
    });

    it('should set valid job rating, emitting "JobRatingGiven" event', () => {
      const rating = 2;
      const jobId = 1;
      return ratingsLibrary.setJobRating(worker, rating, jobId, {from: client})
      .then(tx => eventsHelper.extractEvents(tx, "JobRatingGiven"))
      .then(events => {
        assert.equal(events.length, 1);
        assert.equal(events[0].address, multiEventsHistory.address);
        assert.equal(events[0].args.self, ratingsLibrary.address);
        assert.equal(events[0].event, 'JobRatingGiven');
        assert.equal(events[0].args.rater, client);
        assert.equal(events[0].args.to, worker);
        assert.equal(events[0].args.rating, rating);
        assert.equal(events[0].args.jobId, jobId);
      })
      .then(() => ratingsLibrary.getJobRating(worker, jobId))
      .then(tx => {
        assert.equal(tx[1], rating);
        assert.equal(tx[0], client);
      })
      .then(() => helpers.assertExpectations(mock));
    });

    it('should allow to rate a canceled job', () => {
      const jobId = NOT_FINALIZED_JOB;
      const rating = 5;
      return Promise.resolve()
      .then(() => jobController.cancelJob(jobId, {from: client}))
      .then(() => ratingsLibrary.setJobRating.call(
        worker, rating, jobId, {from: client}
      ))
      .then(code => assert.equal(code.toNumber(), ErrorsNamespace.OK))
    });

    it('should store different job ratings', () => {
      const clientRating1 = 3;
      const clientRating2 = 4;
      const workerRating1 = 5;
      const workerRating2 = 6;
      const client1 = accounts[2];
      const client2 = accounts[3];
      const worker1 = accounts[4];
      const worker2 = accounts[5];
      let jobId1;
      let jobId2;
      return Promise.resolve()
      .then(() => setupJob(1, 1, 1, client1, worker1))
      .then(tx => jobId1 = tx.toNumber())
      .then(() => boardController.bindJobWithBoard(boardId, jobId1))
      .then(() => finishJob(jobId1, client1, worker1))
      .then(() => setupJob(2, 2, 2, client2, worker2))
      .then(tx => jobId2 = tx.toNumber())
      .then(() => boardController.bindJobWithBoard(boardId, jobId2))
      .then(() => finishJob(jobId2, client2, worker2))

      .then(() => boardController.bindUserWithBoard(boardId, client1))
      .then(() => boardController.bindUserWithBoard(boardId, client2))
      .then(() => boardController.bindUserWithBoard(boardId, worker1))
      .then(() => boardController.bindUserWithBoard(boardId, worker2))

      .then(() => ratingsLibrary.setJobRating(worker1, workerRating1, jobId1, {from: client1}))
      .then(() => ratingsLibrary.setJobRating(worker2, workerRating2, jobId2, {from: client2}))
      .then(() => ratingsLibrary.setJobRating(client1, clientRating1, jobId1, {from: worker1}))
      .then(() => ratingsLibrary.setJobRating(client2, clientRating2, jobId2, {from: worker2}))

      .then(() => ratingsLibrary.getJobRating(worker1, jobId1))
      .then(tx => {
        assert.equal(tx[1], workerRating1);
        assert.equal(tx[0], client1);
      })
      .then(() => ratingsLibrary.getJobRating(worker2, jobId2))
      .then(tx => {
        assert.equal(tx[1], workerRating2);
        assert.equal(tx[0], client2);
      })
      .then(() => ratingsLibrary.getJobRating(client1, jobId1))
      .then(tx => {
        assert.equal(tx[1], clientRating1);
        assert.equal(tx[0], worker1);
      })
      .then(() => ratingsLibrary.getJobRating(client2, jobId2))
      .then(tx => {
        assert.equal(tx[1], clientRating2);
        assert.equal(tx[0], worker2);
      });
    });

  });


  describe('Skill rating', () => {

    it('should NOT allow to rate worker skills for non-existent job', () => {
      return Promise.resolve()
      .then(() => ratingsLibrary.rateWorkerSkills.call(
        3, worker, 1, 1, [1], [1], {from: client}
      ))
      .then(code => assert.equal(code.toNumber(), ErrorsNamespace.RATING_AND_REPUTATION_CANNOT_SET_RATING))
    });

    it("should NOT allow to rate worker skills if a job is not at FINALIZED state", () => {
      const jobId = NOT_FINALIZED_JOB;
      const area = helpers.getFlag(0);
      const category = helpers.getFlag(0);
      const skills = [1, 2, 4];
      const ratings = [3, 7, 9];
      const call = ratingsLibrary.rateWorkerSkills;
      const args = [jobId, worker, area, category, skills, ratings, {from: client}];
      return Promise.resolve()
      .then(() => call(...args))
      .then(() => jobController.startWork(jobId, {from: worker}))
      .then(() => call(...args))
      .then(() => jobController.confirmStartWork(jobId, {from: client}))
      .then(() => call(...args))
      .then(() => jobController.endWork(jobId, {from: worker}))
      .then(() => call(...args))
      .then(() => jobController.confirmEndWork(jobId, {from: client}))
      .then(() => jobsDataProvider.getJobState(jobId))
      .then(asserts.equal(6))  // Ensure all previous stage changes was successful
      .then(() => call(...args))
      .then(() => Promise.each(skills, skill => {
        return ratingsLibrary.getSkillRating(
          worker, area, category, skill, jobId
        )
        .then(tx => {
          assert.equal(tx[0], 0);
          assert.equal(tx[1], 0);
        });
      }));
    });

    it('should NOT allow to rate worker skills not from job client', () => {
      const jobId = FINALIZED_JOB;
      const area = helpers.getFlag(0);
      const category = helpers.getFlag(0);
      const skills = [1, 2, 4];
      const ratings = [3, 7, 9];
      return Promise.resolve()
      .then(() => Promise.each(accounts.slice(2), account => {
        return ratingsLibrary.rateWorkerSkills(
          jobId, worker, area, category, skills, ratings, {from: account}
        )
        .then(() => Promise.each(skills, skill => {
          return ratingsLibrary.getSkillRating(
            worker, area, category, skill, jobId
          )
          .then(tx => {
            assert.equal(tx[0], 0);
            assert.equal(tx[1], 0);
          });
        }));
      }));
    });

    it('should NOT allow to rate worker skills not for job worker', () => {
      const jobId = FINALIZED_JOB;
      const area = helpers.getFlag(0);
      const category = helpers.getFlag(0);
      const skills = [1, 2, 4];
      const ratings = [3, 7, 9];
      return Promise.resolve()
      .then(() => Promise.each(accounts.slice(3), account => {
        return ratingsLibrary.rateWorkerSkills(
          jobId, account, area, category, skills, ratings, {from: client}
        )
        .then(() => Promise.each(skills, skill => {
          return ratingsLibrary.getSkillRating(
            account, area, category, skill, jobId
          )
          .then(tx => {
            assert.equal(tx[0], 0);
            assert.equal(tx[1], 0);
          });
        }));
      }))
      // Ensure actual worker doesn't have skills rated
      .then(() => Promise.each(skills, skill => {
        return ratingsLibrary.getSkillRating(
          worker, area, category, skill, jobId
        )
        .then(tx => {
          assert.equal(tx[0], 0);
          assert.equal(tx[1], 0);
        });
      }));
    });

    it('should NOT allow to rate worker skills if a job was canceled on ACCEPTED state', () => {
      const jobId = NOT_FINALIZED_JOB;
      const area = helpers.getFlag(0);
      const category = helpers.getFlag(0);
      const skills = [1, 2, 4];
      const ratings = [3, 7, 9];
      return Promise.resolve()
      .then(() => jobController.cancelJob(jobId, {from: client}))
      .then(() => jobsDataProvider.getJobState(jobId))
      .then(asserts.equal(7))  // Ensure the job is FINALIZED
      .then(() => jobsDataProvider.getFinalState(jobId))
      .then(asserts.equal(2))  // Ensure the job was canceled at ACCEPTED state
      .then(() => ratingsLibrary.rateWorkerSkills(
        jobId, worker, area, category, skills, ratings, {from: client}
      ))
      .then(() => Promise.each(skills, skill => {
        return ratingsLibrary.getSkillRating(
          worker, area, category, skill, jobId
        )
        .then(tx => {
          assert.equal(tx[0], 0);
          assert.equal(tx[1], 0);
        });
      }));
    });

    it('should NOT allow to rate worker skills if a job was canceled on PENDING START state', () => {
      const jobId = NOT_FINALIZED_JOB;
      const area = helpers.getFlag(0);
      const category = helpers.getFlag(0);
      const skills = [1, 2, 4];
      const ratings = [3, 7, 9];
      return Promise.resolve()
      .then(() => jobController.startWork(jobId, {from: worker}))
      .then(() => jobController.cancelJob(jobId, {from: client}))
      .then(() => jobsDataProvider.getJobState(jobId))
      .then(asserts.equal(7))  // Ensure the job is FINALIZED
      .then(() => jobsDataProvider.getFinalState(jobId))
      .then(asserts.equal(3))  // Ensure the job was canceled at PENDING_START state
      .then(() => ratingsLibrary.rateWorkerSkills(
        jobId, worker, area, category, skills, ratings, {from: client}
      ))
      .then(() => Promise.each(skills, skill => {
        return ratingsLibrary.getSkillRating(
          worker, area, category, skill, jobId
        )
        .then(tx => {
          assert.equal(tx[0], 0);
          assert.equal(tx[1], 0);
        });
      }));
    });

    it('should NOT allow to set skills if they are already set', () => {
      const jobId = FINALIZED_JOB;
      const area = helpers.getFlag(0);
      const category = helpers.getFlag(0);
      const skills = [1, 2, 4];
      const ratings = [3, 7, 9];
      return Promise.resolve()
      .then(() => ratingsLibrary.rateWorkerSkills(
        jobId, worker, area, category, skills, ratings, {from: client}
      ))
      .then(() => Promise.each(skills, (skill, i) => {
        return ratingsLibrary.getSkillRating(
          worker, area, category, skill, jobId
        )
        .then(tx => {
          assert.equal(tx[0], client);
          assert.equal(tx[1], ratings[i]);
        });
      }))
      .then(() => ratingsLibrary.rateWorkerSkills.call(
        jobId, worker, area, category, skills, ratings, {from: client}
      ))
      .then(code => assert.equal(code.toNumber(), ErrorsNamespace.RATING_AND_REPUTATION_CANNOT_SET_RATING))
    });

    it('should allow to set skills after failed attempt', () => {
      const jobId = FINALIZED_JOB;
      const area = helpers.getFlag(0);
      const category = helpers.getFlag(0);
      const skills = [1, 2, 4];
      const ratings = [3, 7, 9];
      const incorrectSkills = [-3, 0, 99999];
      return Promise.resolve()
      .then(() => asserts.throws(ratingsLibrary.rateWorkerSkills(
        jobId, worker, area, category, incorrectSkills, ratings, {from: client}
      )))
      .then(() => ratingsLibrary.rateWorkerSkills(
        jobId, worker, area, category, skills, ratings, {from: client}
      ))
      .then(() => Promise.each(skills, (skill, i) => {
        return ratingsLibrary.getSkillRating(
          worker, area, category, skill, jobId
        )
        .then(tx => {
          assert.equal(tx[0], client);
          assert.equal(tx[1], ratings[i]);
        });
      }));
    });

    it('should NOT rate worker skills with even flag job area', () => {
      const jobId = FINALIZED_JOB;
      const area = 2;
      const category = helpers.getFlag(0);
      const skills = [1, 2, 4];
      const ratings = [3, 7, 9];
      return Promise.resolve()
      .then(() => ratingsLibrary.rateWorkerSkills(
        jobId, worker, area, category, skills, ratings, {from: client}
      ))
      .then(() => Promise.each(skills, skill => {
        return ratingsLibrary.getSkillRating(
          worker, area, category, skill, jobId
        )
        .then(tx => {
          assert.equal(tx[0], 0);
          assert.equal(tx[1], 0);
        });
      }));
    });

    it('should NOT rate worker skills with multi-flag job area', () => {
      const jobId = FINALIZED_JOB;
      const area = 3;
      const category = helpers.getFlag(0);
      const skills = [1, 2, 4];
      const ratings = [3, 7, 9];
      return Promise.resolve()
      .then(() => ratingsLibrary.rateWorkerSkills(
        jobId, worker, area, category, skills, ratings, {from: client}
      ))
      .then(() => Promise.each(skills, skill => {
        return ratingsLibrary.getSkillRating(
          worker, area, category, skill, jobId
        )
        .then(tx => {
          assert.equal(tx[0], 0);
          assert.equal(tx[1], 0);
        });
      }));
    });

    it('should NOT rate worker skills with area that is unrelated to the given job', () => {
      const jobId = FINALIZED_JOB;
      const area = helpers.getFlag(1);
      const category = helpers.getFlag(0);
      const skills = [1, 2, 4];
      const ratings = [3, 7, 9];
      return Promise.resolve()
      .then(() => ratingsLibrary.rateWorkerSkills(
        jobId, worker, area, category, skills, ratings, {from: client}
      ))
      .then(() => Promise.each(skills, skill => {
        return ratingsLibrary.getSkillRating(
          worker, area, category, skill, jobId
        )
        .then(tx => {
          assert.equal(tx[0], 0);
          assert.equal(tx[1], 0);
        });
      }));
    });

    it('should NOT rate worker skills with even flag job category', () => {
      const jobId = FINALIZED_JOB;
      const area = helpers.getFlag(0);
      const category = 2;
      const skills = [1, 2, 4];
      const ratings = [3, 7, 9];
      return Promise.resolve()
      .then(() => ratingsLibrary.rateWorkerSkills(
        jobId, worker, area, category, skills, ratings, {from: client}
      ))
      .then(() => Promise.each(skills, skill => {
        return ratingsLibrary.getSkillRating(
          worker, area, category, skill, jobId
        )
        .then(tx => {
          assert.equal(tx[0], 0);
          assert.equal(tx[1], 0);
        });
      }));
    });

    it('should NOT rate worker skills with multi-flag job category', () => {
      const jobId = FINALIZED_JOB;
      const area = helpers.getFlag(0);
      const category = 3;
      const skills = [1, 2, 4];
      const ratings = [3, 7, 9];
      return Promise.resolve()
      .then(() => ratingsLibrary.rateWorkerSkills(
        jobId, worker, area, category, skills, ratings, {from: client}
      ))
      .then(() => Promise.each(skills, skill => {
        return ratingsLibrary.getSkillRating(
          worker, area, category, skill, jobId
        )
        .then(tx => {
          assert.equal(tx[0], 0);
          assert.equal(tx[1], 0);
        });
      }));
    });

    it('should NOT rate worker skills with category that is unrelated to the given job', () => {
      const jobId = FINALIZED_JOB;
      const area = helpers.getFlag(0);
      const category = helpers.getFlag(1);
      const skills = [1, 2, 4];
      const ratings = [3, 7, 9];
      return Promise.resolve()
      .then(() => ratingsLibrary.rateWorkerSkills(
        jobId, worker, area, category, skills, ratings, {from: client}
      ))
      .then(() => Promise.each(skills, skill => {
        return ratingsLibrary.getSkillRating(
          worker, area, category, skill, jobId
        )
        .then(tx => {
          assert.equal(tx[0], 0);
          assert.equal(tx[1], 0);
        });
      }));
    });

    it('should NOT rate worker skills with multi-flag skill', () => {
      const jobId = FINALIZED_JOB;
      const area = helpers.getFlag(0);
      const category = helpers.getFlag(0);
      const skills = [1, 2, 5];  // "5" is multi-flag int, incorrect skill
      const ratings = [3, 7, 9];
      return Promise.resolve()
      .then(() => asserts.throws(ratingsLibrary.rateWorkerSkills(
        jobId, worker, area, category, skills, ratings, {from: client}
      )))
      .then(() => Promise.each(skills, skill => {
        return ratingsLibrary.getSkillRating(
          worker, area, category, skill, jobId
        )
        .then(tx => {
          assert.equal(tx[0], 0);
          assert.equal(tx[1], 0);
        });
      }));
    });

    it('should NOT rate worker skills with skill that is not unrelated to the given job', () => {
      const jobId = FINALIZED_JOB;
      const area = helpers.getFlag(0);
      const category = helpers.getFlag(0);
      const skills = [1, 2, 8];  // There's no "8" skill in the job
      const ratings = [3, 7, 9];
      return Promise.resolve()
      .then(() => asserts.throws(ratingsLibrary.rateWorkerSkills(
        jobId, worker, area, category, skills, ratings, {from: client}
      )))
      .then(() => Promise.each(skills, skill => {
        return ratingsLibrary.getSkillRating(
          worker, area, category, skill, jobId
        )
        .then(tx => {
          assert.equal(tx[0], 0);
          assert.equal(tx[1], 0);
        });
      }));
    });

    it('should NOT set skill ratings that are more than 10', () => {
      const jobId = FINALIZED_JOB;
      const area = helpers.getFlag(0);
      const category = helpers.getFlag(0);
      const skills = [1, 2, 4];
      const ratings = [3, 7, 11];  // "11" is a bit too much!
      return Promise.resolve()
      .then(() => asserts.throws(ratingsLibrary.rateWorkerSkills(
        jobId, worker, area, category, skills, ratings, {from: client}
      )))
      .then(() => Promise.each(skills, skill => {
        return ratingsLibrary.getSkillRating(
          worker, area, category, skill, jobId
        )
        .then(tx => {
          assert.equal(tx[0], 0);
          assert.equal(tx[1], 0);
        });
      }));
    });

    it('should NOT set skill ratings that are less than 1', () => {
      const jobId = FINALIZED_JOB;
      const area = helpers.getFlag(0);
      const category = helpers.getFlag(0);
      const skills = [1, 2, 4];
      const ratings = [3, 7, 0];  // "0" is a bit not enough!
      return Promise.resolve()
      .then(() => asserts.throws(ratingsLibrary.rateWorkerSkills(
        jobId, worker, area, category, skills, ratings, {from: client}
      )))
      .then(() => Promise.each(skills, skill => {
        return ratingsLibrary.getSkillRating(
          worker, area, category, skill, jobId
        )
        .then(tx => {
          assert.equal(tx[0], 0);
          assert.equal(tx[1], 0);
        });
      }));
    });


    it('should allow to rate worker skills with valid parameters on successfully finished job', () => {
      const jobId = FINALIZED_JOB;
      const area = helpers.getFlag(0);
      const category = helpers.getFlag(0);
      const skills = [1, 2, 4];
      const ratings = [3, 7, 9];
      return Promise.resolve()
      .then(() => ratingsLibrary.rateWorkerSkills(
        jobId, worker, area, category, skills, ratings, {from: client}
      ))
      .then(() => Promise.each(skills, (skill, i) => {
        return ratingsLibrary.getSkillRating(
          worker, area, category, skill, jobId
        )
        .then(tx => {
          assert.equal(tx[0], client);
          assert.equal(tx[1], ratings[i]);
        });
      }));
    });

    it('should allow to rate worker skills on canceled job if it ended up with STARTED state', () => {
      const jobId = NOT_FINALIZED_JOB;
      const area = helpers.getFlag(0);
      const category = helpers.getFlag(0);
      const skills = [1, 2, 4];
      const ratings = [3, 7, 9];
      return Promise.resolve()
      .then(() => jobController.startWork(jobId, {from: worker}))
      .then(() => jobController.confirmStartWork(jobId, {from: client}))
      .then(() => jobController.cancelJob(jobId, {from: client}))
      .then(() => jobsDataProvider.getJobState(jobId))
      .then(asserts.equal(7))  // Ensure the job is FINALIZED
      .then(() => jobsDataProvider.getFinalState(jobId))
      .then(asserts.equal(4))  // Ensure the job was canceled at STARTED state
      .then(() => ratingsLibrary.rateWorkerSkills(
        jobId, worker, area, category, skills, ratings, {from: client}
      ))
      .then(() => Promise.each(skills, (skill, i) => {
        return ratingsLibrary.getSkillRating(
          worker, area, category, skill, jobId
        )
        .then(tx => {
          assert.equal(tx[0], client);
          assert.equal(tx[1], ratings[i]);
        });
      }));
    });

    it('should allow to rate worker skills on canceled job if it ended up with PENDING_FINISH state', () => {
      const jobId = NOT_FINALIZED_JOB;
      const area = helpers.getFlag(0);
      const category = helpers.getFlag(0);
      const skills = [1, 2, 4];
      const ratings = [3, 7, 9];
      return Promise.resolve()
      .then(() => jobController.startWork(jobId, {from: worker}))
      .then(() => jobController.confirmStartWork(jobId, {from: client}))
      .then(() => jobController.endWork(jobId, {from: worker}))
      .then(() => jobController.cancelJob(jobId, {from: client}))
      .then(() => jobsDataProvider.getJobState(jobId))
      .then(asserts.equal(7))  // Ensure the job is FINALIZED
      .then(() => jobsDataProvider.getFinalState(jobId))
      .then(asserts.equal(5))  // Ensure the job was canceled at PENDING_FINISH state
      .then(() => ratingsLibrary.rateWorkerSkills(
        jobId, worker, area, category, skills, ratings, {from: client}
      ))
      .then(() => Promise.each(skills, (skill, i) => {
        return ratingsLibrary.getSkillRating(
          worker, area, category, skill, jobId
        )
        .then(tx => {
          assert.equal(tx[0], client);
          assert.equal(tx[1], ratings[i]);
        });
      }));
    });

    it('should emit "SkillRatingGiven" event on rate worker skills with valid parameters', () => {
      const jobId = FINALIZED_JOB;
      const area = helpers.getFlag(0);
      const category = helpers.getFlag(0);
      const skills = [1, 2, 4];
      const ratings = [3, 7, 9];
      return Promise.resolve()
      .then(() => ratingsLibrary.rateWorkerSkills(
        jobId, worker, area, category, skills, ratings, {from: client}
      ))
      .then(tx => eventsHelper.extractEvents(tx, "SkillRatingGiven"))
      .then(events => {
        assert.equal(events.length, 3);
        return Promise.each(skills, (skill, i) => {
          assert.equal(events[i].event, "SkillRatingGiven");
          assert.equal(events[i].args.jobId, jobId);
          assert.equal(events[i].args.rater, client);
          assert.equal(events[i].args.to, worker);
          assert.equal(events[i].args.area.toString(), area.toString());
          assert.equal(events[i].args.category.toString(), category.toString());
          assert.equal(events[i].args.skill.toString(), skills[i].toString());
          assert.equal(events[i].args.rating, ratings[i]);
        });
      });
    });

    it('should store different skill ratings', () => {
      const area1 = helpers.getFlag(1);
      const category1 = helpers.getFlag(1);
      const skill1 = 1;
      const area2 = helpers.getFlag(2);
      const category2 = helpers.getFlag(2);
      const skill2 = 2;
      const rating1 = 5;
      const rating2 = 10;
      const client1 = accounts[2];
      const client2 = accounts[3];
      const worker1 = accounts[4];
      const worker2 = accounts[5];
      let jobId1;
      let jobId2;
      return Promise.resolve()
      .then(() => setupJob(1, 1, 1, client1, worker1))
      .then(tx => jobId1 = tx.toNumber())
      .then(() => finishJob(jobId1, client1, worker1))
      .then(() => setupJob(2, 2, 2, client2, worker2))
      .then(tx => jobId2 = tx.toNumber())
      .then(() => finishJob(jobId2, client2, worker2))
      .then(() => ratingsLibrary.rateWorkerSkills(
        jobId1, worker1, area1, category1, [skill1], [rating1], {from: client1}
      ))
      .then(() => ratingsLibrary.rateWorkerSkills(
        jobId2, worker2, area2, category2, [skill2], [rating2], {from: client2}
      ))

      .then(() => ratingsLibrary.getSkillRating(worker1, area1, category1, skill1, jobId1))
      .then(tx => {
        assert.equal(tx[0], client1);
        assert.equal(tx[1], rating1);
      })
      .then(() => ratingsLibrary.getSkillRating(worker2, area2, category2, skill2, jobId2))
      .then(tx => {
        assert.equal(tx[0], client2);
        assert.equal(tx[1], rating2);
      });
    });

  });


  describe('Skill evaluation', () => {

    it('should check auth on area evaluation', () => {
      const area = helpers.getFlag(4);
      const rating = 7;
      const user = accounts[7];
      return Promise.resolve()
      .then(() => ratingsLibrary.setRoles2Library(Mock.address))
      .then(() => mock.expect(
        ratingsLibrary.address,
        0,
        roles2LibraryInterface.canCall.getData(
          evaluator,
          ratingsLibrary.address,
          ratingsLibrary.contract.evaluateArea.getData(user, rating, area).slice(0, 10)
        ),
        0
      ))
      .then(() => ratingsLibrary.evaluateArea(user, rating, area, {from: evaluator}))
      .then(() => helpers.assertExpectations(mock));
    });

    it('should check auth on category evaluation', () => {
      const area = helpers.getFlag(4);
      const category = helpers.getFlag(4);
      const rating = 7;
      const user = accounts[7];
      return Promise.resolve()
      .then(() => ratingsLibrary.setRoles2Library(Mock.address))
      .then(() => mock.expect(
        ratingsLibrary.address,
        0,
        roles2LibraryInterface.canCall.getData(
          evaluator,
          ratingsLibrary.address,
          ratingsLibrary.contract.evaluateCategory.getData(user, rating, area, category).slice(0, 10)
        ),
        0
      ))
      .then(() => ratingsLibrary.evaluateCategory(user, rating, area, category, {from: evaluator}))
      .then(() => helpers.assertExpectations(mock));
    });

    it('should check auth on skill evaluation', () => {
      const area = helpers.getFlag(4);
      const category = helpers.getFlag(4);
      const skill = 4;
      const rating = 7;
      const user = accounts[7];
      return Promise.resolve()
      .then(() => ratingsLibrary.setRoles2Library(Mock.address))
      .then(() => mock.expect(
        ratingsLibrary.address,
        0,
        roles2LibraryInterface.canCall.getData(
          evaluator,
          ratingsLibrary.address,
          ratingsLibrary.contract.evaluateCategory.getData(user, rating, area, category).slice(0, 10)
        ),
        0
      ))
      .then(() => ratingsLibrary.evaluateCategory(user, rating, area, category, {from: evaluator}))
      .then(() => helpers.assertExpectations(mock));
    });

    it('should check auth on multiple evaluation', () => {
      const areas = helpers.getFlag(4);
      const categories = [helpers.getFlag(4)];
      const skills = [4, 8, 16];
      const ratings = [7, 1, 4];
      const user = accounts[7];
      const expectedSig = helpers.getSig(
        "evaluateMany(address,uint256,uint256[],uint256[],uint8[])"
      );
      return Promise.resolve()
      .then(() => ratingsLibrary.setRoles2Library(Mock.address))
      .then(() => mock.expect(
        ratingsLibrary.address,
        0,
        roles2LibraryInterface.canCall.getData(
          evaluator,
          ratingsLibrary.address,
          expectedSig
        ),
        0
      ))
      .then(() => ratingsLibrary.evaluateMany(user, areas, categories, skills, ratings, {from: evaluator}))
      .then(() => helpers.assertExpectations(mock));
    });

    it('should not set invalid worker area evaluation', () => {
      const area = helpers.getFlag(4);
      const rating = 823847;
      const worker = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      return Promise.resolve()
      .then(() => ratingsLibrary.setRoles2Library(Mock.address))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasArea.getData(worker, area),  true))
      .then(() => ratingsLibrary.evaluateArea(worker, rating, area, {from: evaluator}))
      .then(tx => eventsHelper.extractEvents(tx, "AreaEvaluated"))
      .then(events => assert.equal(events.length, 0))
      .then(() => ratingsLibrary.getAreaEvaluation(worker, area, evaluator))
      .then(tx => assert.equal(tx.valueOf(), 0))
      .then(() => helpers.assertExpectations(mock));
    });

    it('should not set invalid worker category evaluation', () => {
      const area = helpers.getFlag(4);
      const category = helpers.getFlag(7);
      const rating = 823847;
      const worker = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      return Promise.resolve()
      .then(() => ratingsLibrary.setRoles2Library(Mock.address))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasCategory.getData(worker, area, category),  true))
      .then(() => ratingsLibrary.evaluateCategory(worker, rating, area, category, {from: evaluator}))
      .then(tx => eventsHelper.extractEvents(tx, "CategoryEvaluated"))
      .then(events => assert.equal(events.length, 0))
      .then(() => ratingsLibrary.getCategoryEvaluation(worker, area, category, evaluator))
      .then(tx => assert.equal(tx.valueOf(), 0))
      .then(() => helpers.assertExpectations(mock));
    });

    it('should not set invalid worker skill evaluation', () => {
      const area = helpers.getFlag(4);
      const category = helpers.getFlag(7);
      const skill = helpers.getFlag(9);
      const rating = 823847;
      const worker = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      return Promise.resolve()
      .then(() => ratingsLibrary.setRoles2Library(Mock.address))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasSkill.getData(worker, area, category, skill),  true))
      .then(() => ratingsLibrary.evaluateSkill(worker, rating, area, category, skill, {from: evaluator}))
      .then(tx => eventsHelper.extractEvents(tx, "SkillEvaluated"))
      .then(events => assert.equal(events.length, 0))
      .then(() => ratingsLibrary.getSkillEvaluation(worker, area, category, skill, evaluator))
      .then(tx => assert.equal(tx.valueOf(), 0))
      .then(() => helpers.assertExpectations(mock));
    });

    it('should not set worker area evaluation if worker doesn\'t have that area', () => {
      const area = helpers.getFlag(4);
      const rating = 3;
      const worker = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      return Promise.resolve()
      .then(() => ratingsLibrary.setRoles2Library(Mock.address))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasArea.getData(worker, area),  false))
      .then(() => ratingsLibrary.evaluateArea(worker, rating, area, {from: evaluator}))
      .then(tx => eventsHelper.extractEvents(tx, "AreaEvaluated"))
      .then(events => assert.equal(events.length, 0))
      .then(() => ratingsLibrary.getAreaEvaluation(worker, area, evaluator))
      .then(tx => assert.equal(tx.valueOf(), 0))
      .then(() => helpers.assertExpectations(mock));
    });

    it('should not set worker category evaluation if worker doesn\'t have that category', () => {
      const area = helpers.getFlag(4);
      const category = helpers.getFlag(7);
      const rating = 4;
      const worker = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      return Promise.resolve()
      .then(() => ratingsLibrary.setRoles2Library(Mock.address))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasCategory.getData(worker, area, category),  false))
      .then(() => ratingsLibrary.evaluateCategory(worker, rating, area, category, {from: evaluator}))
      .then(tx => eventsHelper.extractEvents(tx, "CategoryEvaluated"))
      .then(events => assert.equal(events.length, 0))
      .then(() => ratingsLibrary.getCategoryEvaluation(worker, area, category, evaluator))
      .then(tx => assert.equal(tx.valueOf(), 0))
      .then(() => helpers.assertExpectations(mock));
    });

    it('should not set worker skill evaluation if worker doesn\'t have that skill', () => {
      const area = helpers.getFlag(4);
      const category = helpers.getFlag(7);
      const skill = helpers.getFlag(9);
      const rating = 8;
      const worker = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      return Promise.resolve()
      .then(() => ratingsLibrary.setRoles2Library(Mock.address))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasSkill.getData(worker, area, category, skill),  false))
      .then(() => ratingsLibrary.evaluateSkill(worker, rating, area, category, skill, {from: evaluator}))
      .then(tx => eventsHelper.extractEvents(tx, "SkillEvaluated"))
      .then(events => assert.equal(events.length, 0))
      .then(() => ratingsLibrary.getSkillEvaluation(worker, area, category, skill, evaluator))
      .then(tx => assert.equal(tx.valueOf(), 0))
      .then(() => helpers.assertExpectations(mock));
    });


    it('should set valid worker area evaluation ', () => {
      const area = helpers.getFlag(3);
      const rating = 8;
      const worker = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      return Promise.resolve()
      .then(() => ratingsLibrary.setRoles2Library(Mock.address))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasArea.getData(worker, area), true))
      .then(() => ratingsLibrary.evaluateArea(worker, rating, area, {from: evaluator}))
      .then(tx => eventsHelper.extractEvents(tx, "AreaEvaluated"))
      .then(events => {
        assert.equal(events.length, 1);
        assert.equal(events[0].address, multiEventsHistory.address);
        assert.equal(events[0].args.self, ratingsLibrary.address);
        assert.equal(events[0].event, 'AreaEvaluated');
        assert.equal(events[0].args.rater, evaluator);
        assert.equal(events[0].args.to, worker);
        assert.equal(events[0].args.rating, rating);
        equal(events[0].args.area, area);
      })
      .then(() => ratingsLibrary.getAreaEvaluation(worker, area, evaluator))
      .then(tx => assert.equal(tx.valueOf(), rating))
      .then(() => helpers.assertExpectations(mock));
    });

    it('should set valid worker category evaluation ', () => {
      const area = helpers.getFlag(4);
      const category = helpers.getFlag(7);
      const rating = 8;
      const worker = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      return Promise.resolve()
      .then(() => ratingsLibrary.setRoles2Library(Mock.address))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasCategory.getData(worker, area, category),  true))
      .then(() => ratingsLibrary.evaluateCategory(worker, rating, area, category, {from: evaluator}))
      .then(tx => eventsHelper.extractEvents(tx, "CategoryEvaluated"))
      .then(events => {
        assert.equal(events.length, 1);
        assert.equal(events[0].address, multiEventsHistory.address);
        assert.equal(events[0].args.self, ratingsLibrary.address);
        assert.equal(events[0].event, 'CategoryEvaluated');
        assert.equal(events[0].args.rater, evaluator);
        assert.equal(events[0].args.to, worker);
        assert.equal(events[0].args.rating, rating);
        equal(events[0].args.area, area);
        equal(events[0].args.category, category);
      })
      .then(() => ratingsLibrary.getCategoryEvaluation(worker, area, category, evaluator))
      .then(tx => assert.equal(tx.valueOf(), rating))
      .then(() => helpers.assertExpectations(mock));
    });

    it('should set valid worker skill evaluation ', () => {
      const area = helpers.getFlag(4);
      const category = helpers.getFlag(7);
      const skill = helpers.getFlag(9);
      const rating = 8;
      const worker = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      return Promise.resolve()
      .then(() => ratingsLibrary.setRoles2Library(Mock.address))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasSkill.getData(worker, area, category, skill),  true))
      .then(() => ratingsLibrary.evaluateSkill(worker, rating, area, category, skill, {from: evaluator}))
      .then(tx => eventsHelper.extractEvents(tx, "SkillEvaluated"))
      .then(events => {
        assert.equal(events.length, 1);
        assert.equal(events[0].address, multiEventsHistory.address);
        assert.equal(events[0].args.self, ratingsLibrary.address);
        assert.equal(events[0].event, 'SkillEvaluated');
        assert.equal(events[0].args.rater, evaluator);
        assert.equal(events[0].args.to, worker);
        assert.equal(events[0].args.rating, rating);
        equal(events[0].args.area, area);
        equal(events[0].args.category, category);
        equal(events[0].args.skill, skill);
      })
      .then(() => ratingsLibrary.getSkillEvaluation(worker, area, category, skill, evaluator))
      .then(tx => assert.equal(tx.valueOf(), rating))
      .then(() => helpers.assertExpectations(mock));
    });


    it('should store different area evaluations', () => {
      const area1 = helpers.getFlag(1);
      const area2 = helpers.getFlag(2);
      const rating1 = 8;
      const rating2 = 9;
      const evaluator1 = accounts[2];
      const evaluator2 = accounts[3];
      const worker1 = '0xeeeeeeee11eeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      const worker2 = '0xeeeeeeee22eeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      return Promise.resolve()
      .then(() => ratingsLibrary.setRoles2Library(Mock.address))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasArea.getData(worker1, area1),  true))
      .then(() => ratingsLibrary.evaluateArea(worker1, rating1, area1, {from: evaluator1}))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasArea.getData(worker2, area2),  true))
      .then(() => ratingsLibrary.evaluateArea(worker2, rating2, area2, {from: evaluator2}))
      .then(() => ratingsLibrary.getAreaEvaluation(worker1, area1, evaluator1))
      .then(tx => assert.equal(tx.valueOf(), rating1))
      .then(() => ratingsLibrary.getAreaEvaluation(worker2, area2, evaluator2))
      .then(tx => assert.equal(tx.valueOf(), rating2))
      .then(() => helpers.assertExpectations(mock));
    });

    it('should store different category evaluations', () => {
      const area1 = helpers.getFlag(1);
      const category1 = helpers.getFlag(1);
      const area2 = helpers.getFlag(2);
      const category2 = helpers.getFlag(2);
      const rating1 = 8;
      const rating2 = 9;
      const evaluator1 = accounts[2];
      const evaluator2 = accounts[3];
      const worker1 = '0xeeeeeeee11eeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      const worker2 = '0xeeeeeeee22eeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      return Promise.resolve()
      .then(() => ratingsLibrary.setRoles2Library(Mock.address))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasCategory.getData(worker1, area1, category1),  true))
      .then(() => ratingsLibrary.evaluateCategory(worker1, rating1, area1, category1, {from: evaluator1}))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasCategory.getData(worker2, area2, category2),  true))
      .then(() => ratingsLibrary.evaluateCategory(worker2, rating2, area2, category2, {from: evaluator2}))
      .then(() => ratingsLibrary.getCategoryEvaluation(worker1, area1, category1, evaluator1))
      .then(tx => assert.equal(tx.valueOf(), rating1))
      .then(() => ratingsLibrary.getCategoryEvaluation(worker2, area2, category2, evaluator2))
      .then(tx => assert.equal(tx.valueOf(), rating2))
      .then(() => helpers.assertExpectations(mock));
    });

    it('should store different skill evaluations', () => {
      const area1 = helpers.getFlag(1);
      const category1 = helpers.getFlag(1);
      const skill1 = helpers.getFlag(1);
      const area2 = helpers.getFlag(2);
      const category2 = helpers.getFlag(2);
      const skill2 = helpers.getFlag(2);
      const rating1 = 8;
      const rating2 = 9;
      const evaluator1 = accounts[2];
      const evaluator2 = accounts[3];
      const worker1 = '0xeeeeeeee11eeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      const worker2 = '0xeeeeeeee22eeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      return Promise.resolve()
      .then(() => ratingsLibrary.setRoles2Library(Mock.address))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasSkill.getData(worker1, area1, category1, skill1),  true))
      .then(() => ratingsLibrary.evaluateSkill(worker1, rating1, area1, category1, skill1, {from: evaluator1}))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasSkill.getData(worker2, area2, category2, skill2),  true))
      .then(() => ratingsLibrary.evaluateSkill(worker2, rating2, area2, category2, skill2, {from: evaluator2}))
      .then(() => ratingsLibrary.getSkillEvaluation(worker1, area1, category1, skill1, evaluator1))
      .then(tx => assert.equal(tx.valueOf(), rating1))
      .then(() => ratingsLibrary.getSkillEvaluation(worker2, area2, category2, skill2, evaluator2))
      .then(tx => assert.equal(tx.valueOf(), rating2))
      .then(() => helpers.assertExpectations(mock));
    });


    it('should not have area evaluation set when category evaluation set', () => {
      const area = helpers.getFlag(4);
      const category = helpers.getFlag(7);
      const rating = 8;
      const worker = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      return Promise.resolve()
      .then(() => ratingsLibrary.setRoles2Library(Mock.address))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasCategory.getData(worker, area, category),  true))
      .then(() => ratingsLibrary.evaluateCategory(worker, rating, area, category, {from: evaluator}))
      .then(() => ratingsLibrary.getCategoryEvaluation(worker, area, category, evaluator))
      .then(tx => assert.equal(tx.valueOf(), rating))
      .then(() => ratingsLibrary.getAreaEvaluation(worker, area, evaluator))
      .then(tx => assert.equal(tx.valueOf(), 0))
      .then(() => helpers.assertExpectations(mock));
    })

    it('should not have category and area evaluation set when skill evaluation set', () => {
      const area = helpers.getFlag(4);
      const category = helpers.getFlag(7);
      const skill = helpers.getFlag(9);
      const rating = 8;
      const worker = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      return Promise.resolve()
      .then(() => ratingsLibrary.setRoles2Library(Mock.address))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasSkill.getData(worker, area, category, skill),  true))
      .then(() => ratingsLibrary.evaluateSkill(worker, rating, area, category, skill, {from: evaluator}))
      .then(() => ratingsLibrary.getSkillEvaluation(worker, area, category, skill, evaluator))
      .then(tx => assert.equal(tx.valueOf(), rating))
      .then(() => ratingsLibrary.getCategoryEvaluation(worker, area, category, evaluator))
      .then(tx => assert.equal(tx.valueOf(), 0))
      .then(() => ratingsLibrary.getAreaEvaluation(worker, area, evaluator))
      .then(tx => assert.equal(tx.valueOf(), 0))
      .then(() => helpers.assertExpectations(mock));
    })


    it('should set many evaluations', () => {
      const areas = helpers.getFlag(4).add(helpers.getEvenFlag(5)).add(helpers.getFlag(5));
      const categories = [helpers.getFlag(7).add(helpers.getEvenFlag(9)).add(helpers.getFlag(9)).add(helpers.getFlag(10)).add(helpers.getFlag(25))];
      const skills = [helpers.getFlag(9), helpers.getFlag(12), helpers.getFlag(13).add(helpers.getEvenFlag(23))];
      const ratings = [9, 8, 7, 6, 5];
      return Promise.resolve()
      .then(() => ratingsLibrary.setRoles2Library(Mock.address))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasSkill.getData(worker, helpers.getFlag(4), helpers.getFlag(7), helpers.getFlag(9)),  true))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasCategory.getData(worker, helpers.getFlag(4), helpers.getFlag(9)),  true))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasSkill.getData(worker, helpers.getFlag(4), helpers.getFlag(10), helpers.getFlag(12)),  true))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasSkill.getData(worker, helpers.getFlag(4), helpers.getFlag(25), helpers.getFlag(13).add(helpers.getEvenFlag(23))),  true))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasArea.getData(worker, helpers.getFlag(5)),  true))
      .then(() => ratingsLibrary.evaluateMany(worker, areas, categories, skills, ratings, {from: client}))
      .then(() => ratingsLibrary.getSkillEvaluation(worker, helpers.getFlag(4), helpers.getFlag(7), helpers.getFlag(9), client))
      .then(tx => assert.equal(tx.valueOf(), ratings[0]))
      .then(() => ratingsLibrary.getCategoryEvaluation(worker, helpers.getFlag(4), helpers.getFlag(9), client))
      .then(tx => assert.equal(tx.valueOf(), ratings[1]))
      .then(() => ratingsLibrary.getSkillEvaluation(worker, helpers.getFlag(4), helpers.getFlag(10), helpers.getFlag(12), client))
      .then(tx => assert.equal(tx.valueOf(), ratings[2]))
      .then(() => ratingsLibrary.getSkillEvaluation(worker, helpers.getFlag(4), helpers.getFlag(25), helpers.getFlag(13).add(helpers.getEvenFlag(23)), client))
      .then(tx => assert.equal(tx.valueOf(), ratings[3]))
      .then(() => ratingsLibrary.getAreaEvaluation(worker, helpers.getFlag(5), client))
      .then(tx => assert.equal(tx.valueOf(), ratings[4]))
      .then(() => helpers.assertExpectations(mock));
    });

    it("should not set many evaluations if doesn't have at least one of listed areas/categories/skills", () => {
      const areas = helpers.getFlag(4).add(helpers.getEvenFlag(5)).add(helpers.getFlag(5));
      const categories = [helpers.getFlag(7).add(helpers.getEvenFlag(9)).add(helpers.getFlag(9)).add(helpers.getFlag(10)).add(helpers.getFlag(25))];
      const skills = [helpers.getFlag(9), helpers.getFlag(12), helpers.getFlag(13).add(helpers.getEvenFlag(23))];
      const ratings = [9, 8, 7, 6, 5];
      return Promise.resolve()
      .then(() => ratingsLibrary.setRoles2Library(Mock.address))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasSkill.getData(worker, helpers.getFlag(4), helpers.getFlag(7), helpers.getFlag(9)),  true))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasCategory.getData(worker, helpers.getFlag(4), helpers.getFlag(9)),  true))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasSkill.getData(worker, helpers.getFlag(4), helpers.getFlag(10), helpers.getFlag(12)),  true))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasSkill.getData(worker, helpers.getFlag(4), helpers.getFlag(25), helpers.getFlag(13).add(helpers.getEvenFlag(23))),  true))
      .then(() => mock.expect(ratingsLibrary.address, 0, userLibrary.hasArea.getData(worker, helpers.getFlag(5)),  false))
      .then(() => asserts.throws(ratingsLibrary.evaluateMany(worker, areas, categories, skills, ratings, {from: client})))
      .then(() => helpers.assertExpectations(mock));
    })

  });

});
