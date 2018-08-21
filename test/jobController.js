"use strict";

const BalanceHolder = artifacts.require('./BalanceHolder.sol');
const JobController = artifacts.require('./JobController.sol');
const JobsDataProvider = artifacts.require('./JobsDataProvider.sol');
const BoardController = artifacts.require('./BoardController.sol');
const Mock = artifacts.require('./Mock.sol');
const MultiEventsHistory = artifacts.require('./MultiEventsHistory.sol');
const PaymentGateway = artifacts.require('./PaymentGateway.sol');
const PaymentProcessor = artifacts.require('./PaymentProcessor.sol');
const Roles2Library = artifacts.require('./Roles2Library.sol');
const Roles2LibraryInterface = artifacts.require('./Roles2LibraryInterface.sol');
const Storage = artifacts.require('./Storage.sol');
const UserLibrary = artifacts.require('./UserLibrary.sol');

const Asserts = require('./helpers/asserts');
const Reverter = require('./helpers/reverter');
const eventsHelper = require('./helpers/eventsHelper');

const helpers = require('./helpers/helpers');
const ErrorsNamespace = require('../common/errors')


contract('JobController', function(accounts) {
  const reverter = new Reverter(web3);
  afterEach('revert', reverter.revert);

  const asserts = Asserts(assert);
  const roles2LibraryInterface = web3.eth.contract(Roles2LibraryInterface.abi).at('0x0');
  const userLibraryInterface = web3.eth.contract(UserLibrary.abi).at('0x0');
  let storage;
  let jobController;
  let jobsDataProvider;
  let boardController;
  let multiEventsHistory;
  let paymentProcessor;
  let userLibrary;
  let paymentGateway;
  let balanceHolder;
  let mock;

  const client = accounts[1];
  const worker = accounts[2];
  const client2 = accounts[5];
  const stranger = accounts[9];

  const defaultWorkerOffer = {
    workerRate: 200000000000,
    workerOnTop: 1000000000,
    jobEstimate: 240,
  }

  const AccountRole = {
    INITIATOR: 1,
    NOT_INITIATOR: 2,
  }

  const JobState = {
    NOT_SET: 0, 
    CREATED: 2**0, 
    OFFER_ACCEPTED: 2**1, 
    PENDING_START: 2**2, 
    STARTED: 2**3, 
    PENDING_FINISH: 2**4, 
    FINISHED: 2**5, 
    WORK_ACCEPTED: 2**6, 
    WORK_REJECTED: 2**7, 
    FINALIZED: 2**8,
  }

  const JOBS_RESULT_OFFSET = 23
  const ADDITIONAL_TIME_REQUESTED_IDX = 21

  const jobDefaultPaySize = 90;
  const jobFlow = web3.toBigNumber(2).pow(255).add(1) /// WORKFLOW_TM + CONFIRMATION flag

  const assertInternalBalance = (address, expectedValue) => {
    return (actualValue) => {
      return paymentGateway.getBalance(address)
      .then(asserts.equal(expectedValue));
    };
  };

  const assertEthBalance = async (account, expectedValue) => {
    assert.equal(
      (await helpers.getEthBalance(account)).toString(),
      expectedValue.toString()
    )
  }

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

  const ignoreAuth = (enabled = true) => {
      if (enabled) {
          return JobController.deployed().then(jobController => jobController.setRoles2Library(Roles2Library.address));
      } else {
          return JobController.deployed().then(jobController => jobController.setRoles2Library(mock.address));
      }
  };

  const ignoreSkillsCheck = (enabled = true) => {
    return mock.ignore(userLibraryInterface.hasSkills.getData(0,0,0,0).slice(0, 10), enabled);
  }

  const operationAllowance = (operation, args, results) => {
    let stages = {
      CREATED: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE,
      OFFER_ACCEPTED: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE,
      PENDING_START: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE,
      STARTED: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE,
      PENDING_FINISH: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE,
      FINISHED: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE,
      FINALIZED: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE
    };

    for (let stage in results) {
      stages[stage] = results[stage];
    }

    const jobId = 1;
    const jobArea = 4;
    const jobCategory = 4;
    const jobSkills = 4;
    const jobDetails = 'Job details';
    const additionalTime = 60;

    const workerRate = '0x12f2a36ecd555';
    const workerOnTop = '0x12f2a36ecd555';
    const jobEstimate = 180;

    return Promise.resolve()
      // Represents full chain of interactions between client and worker
      // Provided `operation` will try to execute on each stage, comparing with expected results

      .then(() => jobController.postJob(jobFlow, jobArea, jobCategory, jobSkills, jobDefaultPaySize, jobDetails, {from: client}))
      .then(() => operation.call(...args))
      .then(result => assert.equal(result.toNumber(), stages.CREATED))

      .then(() => jobController.postJobOffer(jobId, workerRate, jobEstimate, workerOnTop, {from: worker}))
      .then(async () => {
        const payment = await jobController.calculateLockAmountFor(worker, jobId)
        return await jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
      })
      .then(() => operation.call(...args))
      .then(result => assert.equal(result.toNumber(), stages.OFFER_ACCEPTED))

      .then(() => jobController.startWork(jobId, {from: worker}))
      .then(() => operation.call(...args))
      .then(result => assert.equal(result.toNumber(), stages.PENDING_START))

      .then(() => jobController.confirmStartWork(jobId, {from: client}))
      .then(() => operation.call(...args))
      .then(result => assert.equal(result.toNumber(), stages.STARTED))

      .then(() => jobController.endWork(jobId, {from: worker}))
      .then(() => operation.call(...args))
      .then(result => assert.equal(result.toNumber(), stages.PENDING_FINISH))

      .then(() => jobController.confirmEndWork(jobId, {from: client}))
      .then(() => operation.call(...args))
      .then(result => assert.equal(result.toNumber(), stages.FINISHED))

      .then(() => jobController.releasePayment(jobId))
      .then(() => operation.call(...args))
      .then(result => assert.equal(result.toNumber(), stages.FINALIZED));
  }

  const onReleasePayment = async ({ timeSpent, jobPaymentEstimate, pauses = false, offer = defaultWorkerOffer, beforeEndWorkHook, }) => {
    const jobId = 1;

    const timeOps = () => {
      if (pauses) {
        return Promise.resolve()
        .then(() => helpers.increaseTime(timeSpent / 2 * 60))
        .then(() => helpers.mine())
        .then(() => jobController.pauseWork(jobId, {from: worker}))
        .then(() => helpers.increaseTime(30 * 60))
        .then(() => helpers.mine())
        .then(() => jobController.resumeWork(jobId, {from: worker}))
        .then(() => helpers.increaseTime(timeSpent / 2 * 60))
        .then(() => helpers.mine())
      } else {
        return Promise.resolve()
        .then(() => helpers.increaseTime(timeSpent * 60))
        .then(() => helpers.mine())
      }
    }

    await jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, 'Job details', {from: client})
    await jobController.postJobOffer(
      jobId, offer.workerRate, offer.jobEstimate, offer.workerOnTop, {from: worker}
    )
    const payment = await jobController.calculateLockAmountFor(worker, jobId)
    await jobController.acceptOffer(jobId, worker, { from: client, value: payment, })

    const clientBalanceBefore = await paymentGateway.getBalance(client)
    const workerBalanceBefore = await paymentGateway.getBalance(worker)

    await jobController.startWork(jobId, {from: worker})
    await jobController.confirmStartWork(jobId, {from: client})

    await timeOps()
    
    var morePayments = 0
    if (beforeEndWorkHook !== undefined) {
      morePayments = await beforeEndWorkHook(jobId)
      morePayments = morePayments || 0
    }

    await jobController.endWork(jobId, {from: worker})
    await jobController.confirmEndWork(jobId, {from: client})

    const workerEthBalanceBefore = await helpers.getEthBalance(worker)
    const clientEthBalanceBefore = await helpers.getEthBalance(client)

    await jobController.releasePayment(jobId)

    await (assertInternalBalance(client, clientBalanceBefore)())
    await (assertInternalBalance(worker, workerBalanceBefore)())
    await assertEthBalance(worker, workerEthBalanceBefore.add(jobPaymentEstimate))
    await assertEthBalance(client, clientEthBalanceBefore.add((payment.add(morePayments)).sub(jobPaymentEstimate)))
    await (assertInternalBalance(jobId, 0)())
  }

  before('setup', () => {
    return Mock.deployed()
    .then(instance => mock = instance)
    .then(() => ignoreAuth())
    .then(() => ignoreSkillsCheck())
    .then(() => MultiEventsHistory.deployed())
    .then(instance => multiEventsHistory = instance)
    .then(() => Storage.deployed())
    .then(instance => storage = instance)
    .then(() => BalanceHolder.deployed())
    .then(instance => balanceHolder = instance)
    .then(() => UserLibrary.deployed())
    .then(instance => userLibrary = instance)
    .then(() => PaymentGateway.deployed())
    .then(instance => paymentGateway = instance)
    .then(() => PaymentProcessor.deployed())
    .then(instance => paymentProcessor = instance)
    .then(() => BoardController.deployed())
    .then(instance => boardController = instance)
    .then(() => JobController.deployed())
    .then(instance => jobController = instance)
    .then(() => JobsDataProvider.deployed())
    .then(instance => jobsDataProvider = instance)
    .then(() => paymentGateway.setupEventsHistory(multiEventsHistory.address))
    .then(() => paymentGateway.setBalanceHolder(balanceHolder.address))
    .then(() => paymentProcessor.setPaymentGateway(paymentGateway.address))
    .then(() => jobController.setPaymentProcessor(paymentProcessor.address))
    .then(() => jobController.setUserLibrary(mock.address))
    .then(() => jobController.setBoardController(boardController.address))
    .then(reverter.snapshot);
  });

  describe('Contract setup', () => {

    it('should check auth on setup event history', () => {
      const caller = accounts[1];
      const newAddress = '0xffffffffffffffffffffffffffffffffffffffff';
      return Promise.resolve()
        .then(() => ignoreAuth(false))
        .then(() => mock.expect(
          jobController.address,
          0,
          roles2LibraryInterface.canCall.getData(
            caller,
            jobController.address,
            jobController.contract.setupEventsHistory.getData(newAddress).slice(0, 10)
          ), 0)
        )
        .then(() => jobController.setupEventsHistory(newAddress, {from: caller}))
        .then(assertExpectations());
    });

    it('should check auth on setting a payment processor', () => {
      const caller = accounts[1];
      const newAddress = '0xffffffffffffffffffffffffffffffffffffffff';
      return Promise.resolve()
        .then(() => ignoreAuth(false))
        .then(() => mock.expect(
          jobController.address,
          0,
          roles2LibraryInterface.canCall.getData(
            caller,
            jobController.address,
            jobController.contract.setPaymentProcessor.getData(newAddress).slice(0, 10)
          ), 0)
        )
        .then(() => jobController.setPaymentProcessor(newAddress, {from: caller}))
        .then(assertExpectations());
    });

    it('should check auth on setting a user library', () => {
      const caller = accounts[1];
      const newAddress = '0xffffffffffffffffffffffffffffffffffffffff';
      return Promise.resolve()
        .then(() => ignoreAuth(false))
        .then(() => mock.expect(
          jobController.address,
          0,
          roles2LibraryInterface.canCall.getData(
            caller,
            jobController.address,
            jobController.contract.setUserLibrary.getData(newAddress).slice(0, 10)
          ), 0)
        )
        .then(() => jobController.setUserLibrary(newAddress, {from: caller}))
        .then(assertExpectations());
    });

  });


  describe('Job posting', () => {

    it('should NOT allow to post a job with even area mask', () => {
      const area = helpers.getEvenFlag(1);
      const category = 4;
      const skills = 555;
      return Promise.resolve()
        .then(() => jobController.postJob.call(jobFlow, area, category, skills, jobDefaultPaySize, "Job details"))
        .then(asserts.equal(0));
    });

    it('should NOT allow to post a job with multiple area mask', () => {
      const area = 5;
      const category = 4;
      const skills = 555;
      return Promise.resolve()
        .then(() => jobController.postJob.call(jobFlow, area, category, skills, jobDefaultPaySize, "Job details"))
        .then(asserts.equal(0));
    });

    it('should NOT allow to post a job with even category mask', () => {
      const area = 1;
      const category = 2;
      const skills = 555;
      return Promise.resolve()
        .then(() => jobController.postJob.call(jobFlow, area, category, skills, jobDefaultPaySize, "Job details"))
        .then(asserts.equal(0));
    });

    it('should NOT allow to post a job with multiple category mask', () => {
      const area = 1;
      const category = 5;
      const skills = 555;
      return Promise.resolve()
        .then(() => jobController.postJob.call(jobFlow, area, category, skills, jobDefaultPaySize, "Job details"))
        .then(asserts.equal(0));
    });

    it('should NOT allow to post a job with no skills', () => {
      const area = 1;
      const category = 4;
      const skills = 0;
      return Promise.resolve()
        .then(() => jobController.postJob.call(jobFlow, area, category, skills, jobDefaultPaySize, "Job details"))
        .then(asserts.equal(0));
    });

    it.skip('should NOT allow to post a job with negative skills', () => {
      const area = 1;
      const category = 4;
      const skills = -12;
      return Promise.resolve()
        .then(() => jobController.postJob.call(jobFlow, area, category, skills, jobDefaultPaySize, "Job details"))
        //.then(() => jobController.getJobSkills.call(1))
        .then(asserts.equal(0));
    });

    it('should NOT allow to post a job with negative category', () => {
      const area = 1;
      const category = -4;
      const skills = 3;
      return Promise.resolve()
        .then(() => jobController.postJob.call(jobFlow, area, category, skills, jobDefaultPaySize, "Job details"))
        .then(asserts.equal(0));
    });

    it('should NOT allow to post a job with negative area', () => {
      const area = -1;
      const category = 4;
      const skills = 3;
      return Promise.resolve()
        .then(() => jobController.postJob.call(jobFlow, area, category, skills, jobDefaultPaySize, "Job details"))
        .then(asserts.equal(0));
    });

    it('should allow anyone to post a job', async () => {
      for (const account of accounts) {
        const jobId = await jobController.postJob.call(jobFlow, 4, 4, 4, jobDefaultPaySize, 'Job details', {from: account})
        assert.equal(jobId.toNumber(), 1)
      }
    });

    it('should allow to post a job several times by different users', async () => {
      const clients = accounts.slice(1, 4);
      const area = 1;
      const category = 4;
      const skills = 2;
      const args = [jobFlow, area, category, skills, jobDefaultPaySize, "Job details"];

      for (const c of clients) {
        const tx = await jobController.postJob(...args, {from: c})
        helpers.assertLogs(tx, [{
          event: "JobPosted",
          args: {
            client: c
          }
        }])
      }
      assert.equal((await jobsDataProvider.getJobsCount.call()).toNumber(), 3)
    });

  });


  describe('Post job offer', () => {

    it('should NOT a post job offer with null rate', () => {
      return Promise.resolve()
        .then(() => jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, 'Job details', {from: client}))
        .then(() => jobController.postJobOffer.call(
          1, 0, 1, 1, {from: worker}
          )
        )
        .then((code) => assert.equal(code, ErrorsNamespace.JOB_CONTROLLER_INVALID_ESTIMATE))
    });

    it('should NOT a post job offer with null estimate', () => {
      return Promise.resolve()
        .then(() => jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, 'Job details', {from: client}))
        .then(() => jobController.postJobOffer.call(
          1, '0xfffffffffffffffffff', 0, 1, {from: worker}
          )
        )
        .then((code) => assert.equal(code, ErrorsNamespace.JOB_CONTROLLER_INVALID_ESTIMATE))
    });

    it('should NOT post a job offer when rate/estimate/ontop overflow', () => {
      const jobId = 1;
      const rate = '0x1D1745D1745D1745D1745D1745D1745D1745D1745D1745D1745D1745D1745D1';
      const estimate = 68;
      const ontop = 60;
      /**
       * With these values,  ((rate * (estimate + 60) + ontop) / 10) * 11  will equal (uint256 + 3)
       */
      return Promise.resolve()
        .then(() => jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, 'Job details', {from: client}))
        .then(() => jobController.postJobOffer.call(
          jobId, rate, estimate, ontop, {from: worker}
          )
        )
        .then((code) => assert.equal(code, ErrorsNamespace.JOB_CONTROLLER_INVALID_ESTIMATE))
    });

    it('should allow to post a job offer when lock amount is almost the maximum uint256 value', () => {
      const jobId = 1;
      const rate = '0x1D1745D1745D1745D1745D1745D1745D1745D1745D1745D1745D1745D1745D1';
      const estimate = 68;
      const ontop = 59;
      /**
       * With these values,  ((rate * (estimate + 60) + ontop) / 10) * 11  will equal near the uint256 value
       */
      return Promise.resolve()
        .then(() => jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, 'Job details', {from: client}))
        .then(() => jobController.postJobOffer.call(
          jobId, rate, estimate, ontop, {from: worker}
          )
        )
        .then((code) => assert.equal(code.toNumber(), ErrorsNamespace.OK))
    });

    it("should check skills on posting job offer", () => {
      return jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, 'Job details', {from: client})
        .then(() => ignoreSkillsCheck(false))
        .then(() => mock.expect(
          jobController.address,
          0,
          userLibraryInterface.hasSkills.getData(
            worker, 4, 4, 4
          ),
          0
        ))
        .then(() => jobController.postJobOffer(1, 1000, 180, 1000, {from: worker}))
        .then(assertExpectations());
    });

    it("should NOT post job offer if worker skills does not match", () => {
      return jobController.setUserLibrary(userLibrary.address)
        .then(() => jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, 'Job details', {from: client}))
        .then(() => jobController.postJobOffer.call(
          1, 1000, 180, 1000, {from: worker})
        )
        .then((code) => assert.equal(code, ErrorsNamespace.JOB_CONTROLLER_INVALID_SKILLS))
    });

    it('should NOT allow to post a job offer to yourself', () => {
      const jobId = 1;
      const jobArea = 4;
      const jobCategory = 4;
      const jobSkills = 4;
      const jobDetails = 'Job details';
      const additionalTime = 60;
      const workerRate = '0x12f2a36ecd555';
      const workerOnTop = '0x12f2a36ecd555';
      const jobEstimate = 180;

      return Promise.resolve()
        .then(() => jobController.postJob(jobFlow, jobArea, jobCategory, jobSkills, jobDefaultPaySize, jobDetails, {from: client}))
        .then(() => jobController.postJobOffer.call(jobId, workerRate, jobEstimate, workerOnTop, {from: client}))
        .then((code) => assert.equal(code.toNumber(), ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE))
    });

    it("should allow to post job offer with no ontop payment", () => {
      return Promise.resolve()
        .then(() => jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, 'Job details', {from: client}))
        .then(() => jobController.postJobOffer.call(
          1, '0xfffffffffffffffffff', 1, 0, {from: worker}
          )
        )
        .then((code) => assert.equal(code, ErrorsNamespace.OK))
    });

    it("should post job offer if worker skills match", () => {
      return Promise.resolve()
        .then(() => jobController.setUserLibrary(userLibrary.address))
        .then(() => jobController.postJob(jobFlow, 16, 1, 1, jobDefaultPaySize, 'Job details', {from: client}))
        .then(() => userLibrary.setMany(worker, 16, [1], [1]))
        .then(() => jobController.postJobOffer.call(
          1, 1000, 180, 1000, {from: worker})
        )
        .then((code) => assert.equal(code, ErrorsNamespace.OK))
    });

    it('should allow to post multiple job offers to one job', () => {
      const workers = accounts.slice(1, 4);
      const jobId = 1;
      const jobArea = 4;
      const jobCategory = 4;
      const jobSkills = 4;
      const jobDetails = 'Job details';
      const workerRate = 55;
      const workerOnTop = 55;
      const jobEstimate = 180;
      const args = [jobId, workerRate, jobEstimate, workerOnTop];
      return Promise.resolve()
        .then(() => jobController.postJob(
          jobFlow, jobArea, jobCategory, jobSkills, jobDefaultPaySize, jobDetails, {from: client}
        ))
        .then(async () => {
          for (const w of workers) {
            const tx = await jobController.postJobOffer(...args, {from: w})
            helpers.assertLogs(tx, [{
              address: multiEventsHistory.address,
              event: "JobOfferPosted",
              args: {
                self: jobController.address,
                jobId: jobId,
                worker: w
              }
            }])
          }
        });
    });

  });


  describe('Accept job offer', () => {

    it('should NOT accept job offer for non-existent job worker', () => {
      return Promise.resolve()
        .then(() => jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, 'Job details', {from: client}))
        .then(async () => {
          const payment = await jobController.calculateLockAmountFor.call(worker, 1)
          return await jobController.acceptOffer.call(1, worker, { from: client, value: payment, })
        })
        .then((code) => assert.equal(code.toNumber(), ErrorsNamespace.JOB_CONTROLLER_WORKER_RATE_NOT_SET))
    });

    it('should THROW on `acceptOffer` if client sent insufficient funds', () => {
      return Promise.resolve()
        .then(() => jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, 'Job details', {from: client}))
        .then(() => jobController.postJobOffer(
          1, '0xfffffffffffffffffff', 1, 1, {from: worker}
          )
        )
        .then(() => asserts.throws(
          Promise.resolve()
          .then(async () => {
            const payment = await jobController.calculateLockAmountFor.call(worker, 1)
            return await jobController.acceptOffer.call(1, worker, { from: client, value: payment.minus(1), })
          })
        ));
    });

    it('should THROW when trying to accept job offer if payment lock was not ' +
       'allowed in Payment Processor', () => {
      return Promise.resolve()
        .then(() => jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, 'Job details', {from: client}))
        .then(() => jobController.postJobOffer(
          1, '0x12f2a36ecd555', 1, '0x12f2a36ecd555', {from: worker}
          )
        )
        .then(() => paymentProcessor.enableServiceMode())
        .then(() => paymentProcessor.serviceMode())
        .then(assert.isTrue)
        .then(() => asserts.throws(
          Promise.resolve()
          .then(async () => {
            const payment = await jobController.calculateLockAmountFor.call(worker, 1)
            return await jobController.acceptOffer.call(1, worker, { from: client, value: payment, })
          })
        ));
    });

    it('should allow to accept job offer if payment lock was allowed by Payment Processor', () => {
      return Promise.resolve()
        .then(() => jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, 'Job details', {from: client}))
        .then(() => jobController.postJobOffer(
          1, '0x12f2a36ecd555', 1, '0x12f2a36ecd555', {from: worker}
          )
        )
        .then(() => paymentProcessor.enableServiceMode())
        .then(() => paymentProcessor.serviceMode())
        .then(assert.isTrue)
        .then(() => paymentProcessor.approve(1))
        .then(async () => {
          const payment = await jobController.calculateLockAmountFor.call(worker, 1)
          return await jobController.acceptOffer.call(1, worker, { from: client, value: payment, })
        })
        .then((code) => assert.equal(code, ErrorsNamespace.OK))
    });

    it('should transfer ETH back if an error encountered during payable function call (`acceptOffer`)', async () => {
      const jobId = 1;
      const workerOffer = defaultWorkerOffer

      await jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, 'Job details ipfs hash', {from: client})
      await jobController.postJobOffer(
        jobId, workerOffer.workerRate, workerOffer.jobEstimate, workerOffer.workerOnTop, { from: worker, }
      )
      {
        const caller = worker 
        const beforeCallerBalance = await helpers.getEthBalance(caller)
        const payment = await jobController.calculateLockAmountFor.call(worker, jobId)
        const tx = await jobController.acceptOffer(jobId, worker, { from: caller, value: payment, })
        const txExpenses = await helpers.getTxExpences(tx.tx)
        const afterCallerBalance = await helpers.getEthBalance(caller)
        assert.equal(beforeCallerBalance.sub(txExpenses).toString(16), afterCallerBalance.toString(16))
      }
    });

    it('should lock correct amount of tokens on `acceptOffer`', () => {
      const jobId = 1;
      const workerRate = 200000000000;
      const workerOnTop = 1000000000;
      const jobEstimate = 240;

      let clientBalanceBefore;
      let workerBalanceBefore;

      const estimatedLockAmount = Math.floor(
        ((workerRate * (jobEstimate + 60) + workerOnTop) / 10) * 11
      );

      return Promise.resolve()
        .then(() => paymentGateway.getBalance(worker))
        .then(result => workerBalanceBefore = result)
        .then(() => paymentGateway.getBalance(client))
        .then(result => clientBalanceBefore = result)
        .then(() => jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, 'Job details ipfs hash', {from: client}))
        .then(() => jobController.postJobOffer(
          jobId, workerRate, jobEstimate, workerOnTop, {from: worker}
        ))
        .then(async () => {
          const payment = await jobController.calculateLockAmountFor.call(worker, jobId)
          return await jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
        })
        .then(() => paymentGateway.getBalance(client))
        .then(result => assert.equal(result.toString(), '0'))
        .then(() => paymentGateway.getBalance(jobId))
        .then(result => assert.equal(result.toString(), estimatedLockAmount.toString()))
        .then(() => paymentGateway.getBalance(worker))
        .then(result => assert.equal(result.toString(), workerBalanceBefore.toString()));
    });

  });


  describe('Job status and caller restrictions', () => {

    it('should NOT allow to call all client-worker workflow methods not by these guys', () => {
      const jobId = 1;
      const jobArea = 4;
      const jobCategory = 4;
      const jobSkills = 4;
      const jobDetails = 'Job details';
      const additionalTime = 60;
      const workerRate = '0x12f2a36ecd555';
      const workerOnTop = '0x12f2a36ecd555';
      const jobEstimate = 180;

      return Promise.resolve()
        .then(() => jobController.postJob(jobFlow, jobArea, jobCategory, jobSkills, jobDefaultPaySize, jobDetails, {from: client}))
        .then(() => jobController.postJobOffer(jobId, workerRate, jobEstimate, workerOnTop, {from: worker}))
        .then(async () => {
          const payment = await jobController.calculateLockAmountFor.call(worker, jobId)
          return await jobController.acceptOffer.call(jobId, worker, { from: stranger, value: payment, })
        })
        .then((code) => assert.equal(code.toNumber(), ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE))
        .then(async () => {
          const payment = await jobController.calculateLockAmountFor.call(worker, jobId)
          return await jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
        })
        .then(() => jobController.cancelJob.call(jobId, {from: client}))
        .then((code) => assert.equal(code, ErrorsNamespace.OK))
        .then(() => jobController.cancelJob.call(jobId, {from: stranger}))
        .then((code) => assert.equal(code.toNumber(), ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE))
        .then(() => jobController.startWork.call(jobId, {from: stranger}))
        .then((code) => assert.equal(code.toNumber(), ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE))
        .then(() => jobController.startWork(jobId, {from: worker}))
        .then(() => jobController.cancelJob.call(jobId, {from: client}))
        .then((code) => assert.equal(code, ErrorsNamespace.OK))
        .then(() => jobController.cancelJob.call(jobId, {from: stranger}))
        .then((code) => assert.equal(code.toNumber(), ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE))

        .then(() => jobController.confirmStartWork.call(jobId, {from: stranger}))
        .then((code) => assert.equal(code.toNumber(), ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE))
        .then(() => jobController.confirmStartWork(jobId, {from: client}))
        .then(() => jobController.cancelJob.call(jobId, {from: client}))
        .then((code) => assert.equal(code, ErrorsNamespace.OK))
        .then(() => jobController.cancelJob.call(jobId, {from: stranger}))
        .then((code) => assert.equal(code.toNumber(), ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE))

        .then(() => jobController.pauseWork.call(jobId, {from: stranger}))
        .then((code) => assert.equal(code.toNumber(), ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE))
        .then(() => jobController.pauseWork(jobId, {from: worker}))
        .then(tx => eventsHelper.extractEvents(tx, "WorkPaused"))
        .then(events => assert.equal(events.length, 1))

        .then(() => jobController.resumeWork.call(jobId, {from: stranger}))
        .then((code) => assert.equal(code.toNumber(), ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE))
        .then(() => jobController.resumeWork(jobId, {from: worker}))
        .then(tx => eventsHelper.extractEvents(tx, "WorkResumed"))
        .then(events => assert.equal(events.length, 1))

        .then(async () => {
          return await jobController.submitAdditionalTimeRequest.call(jobId, additionalTime, { from: stranger, })
        })
        .then((code) => assert.equal(code.toNumber(), ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE))
        .then(async () => {
          return await jobController.submitAdditionalTimeRequest(jobId, additionalTime, { from: worker, })
        })
        .then(tx => eventsHelper.extractEvents(tx, "TimeRequestSubmitted"))
        .then(events => assert.equal(events.length, 1))
        .then(async () => {
          const additionalPayment = await jobController.calculateLock.call(worker, jobId, additionalTime, 0)
          return await jobController.acceptAdditionalTimeRequest.call(jobId, additionalTime, { from: stranger, value: additionalPayment, })
        })
        .then((code) => assert.equal(code.toNumber(), ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE))
        .then(async () => {
          const additionalPayment = await jobController.calculateLock.call(worker, jobId, additionalTime, 0)
          return await jobController.acceptAdditionalTimeRequest(jobId, additionalTime, { from: client, value: additionalPayment, })
        })
        .then(tx => eventsHelper.extractEvents(tx, "TimeRequestAccepted"))
        .then(events => assert.equal(events.length, 1))

        .then(async () => {
          return await jobController.submitAdditionalTimeRequest(jobId, additionalTime, { from: worker, })
        })
        .then(tx => eventsHelper.extractEvents(tx, "TimeRequestSubmitted"))
        .then(events => assert.equal(events.length, 1))
        .then(async () => {
          return await jobController.rejectAdditionalTimeRequest.call(jobId, { from: stranger, })
        })
        .then((code) => assert.equal(code.toNumber(), ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE))
        .then(async () => {
          return await jobController.rejectAdditionalTimeRequest(jobId, { from: client, })
        })
        .then(tx => eventsHelper.extractEvents(tx, "TimeRequestRejected"))
        .then(events => assert.equal(events.length, 1))

        .then(() => jobController.endWork.call(jobId, {from: stranger}))
        .then((code) => assert.equal(code.toNumber(), ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE))
        .then(() => jobController.endWork(jobId, {from: worker}))
        .then(() => jobController.cancelJob.call(jobId, {from: client}))
        .then((code) => assert.equal(code, ErrorsNamespace.OK))
        .then(() => jobController.cancelJob.call(jobId, {from: stranger}))
        .then((code) => assert.equal(code.toNumber(), ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE))

        .then(() => jobController.confirmEndWork.call(jobId, {from: stranger}))
        .then((code) => assert.equal(code.toNumber(), ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE))
        .then(() => jobController.confirmEndWork(jobId, {from: client}))

        .then(() => jobController.releasePayment(jobId))
        .then(() => jobsDataProvider.getJobState(jobId))
        .then(asserts.equal(JobState.FINALIZED));
    });

    it('should allow anyone to post an offer for a job only when a job has CREATED status', () => {
      const operation = jobController.postJobOffer;
      const args = [1, '0x12F2A36ECD555', 180, '0x12F2A36ECD555', {from: worker}];
      const results = {
        CREATED: ErrorsNamespace.OK,
        OFFER_ACCEPTED: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE,
      };
      return Promise.resolve()
        .then(() => operationAllowance(operation, args, results));
    });

    it('should allow assigned worker to request work start only when a job has OFFER_ACCEPTED status', () => {
      const operation = jobController.startWork;
      const args = [1, {from: worker}];
      const results = {
        CREATED: ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE,
        OFFER_ACCEPTED: ErrorsNamespace.OK,
        PENDING_START: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE,
      };
      return Promise.resolve()
        .then(() => operationAllowance(operation, args, results));
    });

    it('should allow client to confirm start work only when job has PENDING_START status', () => {
      const operation = jobController.confirmStartWork;
      const args = [1, {from: client}];
      const results = {
        PENDING_START: ErrorsNamespace.OK,
        STARTED: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE
      };
      return Promise.resolve()
        .then(() => operationAllowance(operation, args, results));
    });

    it('should allow assigned worker to request end work only when job has STARTED status', () => {
      const operation = jobController.endWork;
      const args = [1, {from: worker}];
      const results = {
          CREATED: ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE,
          OFFER_ACCEPTED: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE,
          PENDING_START: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE,
          STARTED: ErrorsNamespace.OK,
      };
      return Promise.resolve()
        .then(() => operationAllowance(operation, args, results));
    });

    it('should allow client to confirm end work only when job has PENDING_FINISH status', () => {
      const operation = jobController.confirmEndWork;
      const args = [1, {from: client}];
      const results = {PENDING_FINISH: ErrorsNamespace.OK};
      return Promise.resolve()
        .then(() => operationAllowance(operation, args, results));
    });

    it('should allow anyone to release payment only when job has FINISHED status', () => {
      const operation = jobController.releasePayment;
      const args = [1, {from: accounts[3]}];
      const results = {FINISHED: ErrorsNamespace.OK};
      return Promise.resolve()
        .then(() => operationAllowance(operation, args, results));
    });

    it('should allow client to cancel job only at OFFER_ACCEPTED, PENDING_START, STARTED and PENDING_FINISH states', () => {
      const operation = jobController.cancelJob;
      const args = [1, {from: client}];
      const results = {
        OFFER_ACCEPTED: ErrorsNamespace.OK,
        PENDING_START: ErrorsNamespace.OK,
        STARTED: ErrorsNamespace.OK,
        PENDING_FINISH: ErrorsNamespace.OK
      };
      return Promise.resolve()
        .then(() => operationAllowance(operation, args, results));
    });

    it('should NOT allow to cancel job if it was agreed as FINISHED', () => {
      const jobId = 1;
      const jobArea = 4;
      const jobCategory = 4;
      const jobSkills = 4;
      const jobDetails = 'Job details';

      const workerRate = '0x12f2a36ecd555';
      const workerOnTop = '0x12f2a36ecd555';
      const jobEstimate = 180;

      return Promise.resolve()
        .then(() => jobController.postJob(jobFlow, jobArea, jobCategory, jobSkills, jobDefaultPaySize, jobDetails, {from: client}))
        .then(() => jobController.postJobOffer(jobId, workerRate, jobEstimate, workerOnTop, {from: worker}))
        .then(async () => {
          const payment = await jobController.calculateLockAmountFor.call(worker, jobId)
          return await jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
        })
        .then(() => jobController.startWork(jobId, {from: worker}))
        .then(() => jobController.confirmStartWork(jobId, {from: client}))
        .then(() => jobController.endWork(jobId, {from: worker}))
        .then(() => jobController.confirmEndWork(jobId, {from: client}))
        .then(() => jobsDataProvider.getJobState(jobId))
        .then(asserts.equal(JobState.FINISHED))
        .then(() => jobController.cancelJob.call(jobId, {from: client}))
        .then((code) => assert.equal(code, ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE))
    });

  });


  describe('Time adjustments', () => {

    it("should NOT allow to pause work if it's already paused", () => {
      const jobId = 1
      const workerRate = '0x12f2a36ecd555';
      const workerOnTop = '0x12f2a36ecd555';
      const jobEstimate = 180;
      return Promise.resolve()
        .then(() => jobController.postJob(jobFlow, 4, 4, 7, jobDefaultPaySize, 'Job details', {from: client}))
        .then(() => jobController.postJobOffer(
          jobId, workerRate, jobEstimate, workerOnTop, {from: worker}
        ))
        .then(async () => {
          const payment = await jobController.calculateLockAmountFor.call(worker, jobId)
          return await jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
        })
        .then(() => jobController.startWork(jobId, {from: worker}))
        .then(() => jobController.confirmStartWork(jobId, {from: client}))
        .then(() => jobController.pauseWork(jobId, {from: worker}))
        .then(tx => eventsHelper.extractEvents(tx, "WorkPaused"))
        .then(events => assert.equal(events.length, jobId))
        .then(() => jobController.pauseWork.call(jobId, {from: worker}))
        .then((code) => assert.equal(code, ErrorsNamespace.JOB_CONTROLLER_WORK_IS_ALREADY_PAUSED))
    });

    it("should NOT allow to resume work if it isn't paused", () => {
      const jobId = 1
      const workerRate = '0x12f2a36ecd555';
      const workerOnTop = '0x12f2a36ecd555';
      const jobEstimate = 180;
      return Promise.resolve()
        .then(() => jobController.postJob(jobFlow, 4, 4, 7, jobDefaultPaySize, 'Job details', {from: client}))

        .then(() => jobController.postJobOffer(
          jobId, workerRate, jobEstimate, workerOnTop, {from: worker}
        ))
        .then(async () => {
          const payment = await jobController.calculateLockAmountFor.call(worker, jobId)
          return await jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
        })
        .then(() => jobController.startWork(jobId, {from: worker}))
        .then(() => jobController.confirmStartWork(jobId, {from: client}))
        .then(() => jobController.resumeWork.call(jobId, {from: worker}))
        .then((code) => assert.equal(code, ErrorsNamespace.JOB_CONTROLLER_WORK_IS_NOT_PAUSED))
    });
  });


  describe('Events', () => {

    it('should emit all events on a workflow with completed job', () => {
      const jobId = '1'
      const skillsArea = '4';
      const skillsCategory = '4';
      const skills = '555';
      const jobDetailsIpfsHash = "Job details";

      const workerRate = '0x12f2a36ecd555';
      const workerOnTop = '0x12f2a36ecd555';
      const jobEstimate = 180;

      const additionalTime = 60

      return Promise.resolve()
        // Post job
        .then(() => jobController.postJob(jobFlow, skillsArea, skillsCategory, skills, jobDefaultPaySize, jobDetailsIpfsHash, {from: client}))
        .then(tx => eventsHelper.extractEvents(tx, "JobPosted"))
        .then(async (events) => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'JobPosted');
          const log = events[0].args;
          assert.equal(log.self, jobController.address);
          assert.equal(log.jobId.toString(), jobId);
          assert.equal(log.client, client);
          assert.equal(log.skillsArea.toString(), skillsArea);
          assert.equal(log.skillsCategory.toString(), skillsCategory);
          assert.equal(log.skills.toString(), skills);
          assert.equal(log.detailsIPFSHash, await mock.convertToBytes32.call(jobDetailsIpfsHash));
        })
        // Post job offer
        .then(() => jobController.postJobOffer(
          jobId, workerRate, jobEstimate, workerOnTop, {from: worker}
          )
        )
        .then(tx => eventsHelper.extractEvents(tx, "JobOfferPosted"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'JobOfferPosted');
          const log = events[0].args;
          assert.equal(log.self, jobController.address);
          assert.equal(log.jobId.toString(), jobId);
          assert.equal(log.worker, worker);
          assert.equal('0x' + log.rate.toString(16), workerRate);
          assert.equal(log.estimate.toString(), jobEstimate);
          assert.equal('0x' + log.ontop.toString(16), workerOnTop);
        })
        // Accept job offer
        .then(async () => {
          const payment = await jobController.calculateLockAmountFor.call(worker, jobId)
          return await jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
        })
        .then(tx => eventsHelper.extractEvents(tx, "JobOfferAccepted"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'JobOfferAccepted');
          const log = events[0].args;
          assert.equal(log.self, jobController.address);
          assert.equal(log.jobId.toString(), jobId);
          assert.equal(log.worker, worker);
        })
        // Request start of work
        .then(() => jobController.startWork(jobId, {from: worker}))
        .then(tx => eventsHelper.extractEvents(tx, "StartWorkRequested"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'StartWorkRequested');
          const log = events[0].args;
          assert.equal(log.self, jobController.address);
          assert.equal(log.jobId.toString(), jobId);
        })
        // Confirm start of work
        .then(() => jobController.confirmStartWork(jobId, {from: client}))
        .then(tx => eventsHelper.extractEvents(tx, "WorkStarted"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'WorkStarted');
          const log = events[0].args;
          assert.equal(log.self, jobController.address);
          assert.equal(log.jobId.toString(), jobId);
        })
        // Pause work
        .then(() => jobController.pauseWork(jobId, {from: worker}))
        .then(tx => eventsHelper.extractEvents(tx, "WorkPaused"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'WorkPaused');
          const log = events[0].args;
          assert.equal(log.self, jobController.address);
          assert.equal(log.jobId.toString(), jobId);
        })
        // Resume work
        .then(() => jobController.resumeWork(jobId, {from: worker}))
        .then(tx => eventsHelper.extractEvents(tx, "WorkResumed"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'WorkResumed');
          const log = events[0].args;
          assert.equal(log.self, jobController.address);
          assert.equal(log.jobId.toString(), jobId);
        })
        // Add more time
        .then(async () => {
          return await jobController.submitAdditionalTimeRequest(jobId, additionalTime, { from: worker, })
        })
        .then(tx => eventsHelper.extractEvents(tx, "TimeRequestSubmitted"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'TimeRequestSubmitted');
          
          const log = events[0].args;
          assert.equal(log.self, jobController.address);
          assert.equal(log.jobId.toString(), jobId);
          assert.equal(log.time.toString(), additionalTime.toString());
        })
        .then(async () => {
          const additionalPayment = await jobController.calculateLock.call(worker, jobId, additionalTime, 0)
          return await jobController.acceptAdditionalTimeRequest(jobId, additionalTime, { from: client, value: additionalPayment, })
        })
        .then(tx => eventsHelper.extractEvents(tx, "TimeRequestAccepted"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'TimeRequestAccepted');
          
          const log = events[0].args;
          assert.equal(log.self, jobController.address);
          assert.equal(log.jobId.toString(), jobId);
          assert.equal(log.time.toString(), additionalTime.toString());
        })
        // Request end of work
        .then(() => jobController.endWork(jobId, {from: worker}))
        .then(tx => eventsHelper.extractEvents(tx, "EndWorkRequested"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'EndWorkRequested');
          const log = events[0].args;
          assert.equal(log.self, jobController.address);
          assert.equal(log.jobId.toString(), jobId);
        })
        // Confirm end of work
        .then(() => jobController.confirmEndWork(jobId, {from: client}))
        .then(tx => eventsHelper.extractEvents(tx, "WorkFinished"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'WorkFinished');
          const log = events[0].args;
          assert.equal(log.self, jobController.address);
          assert.equal(log.jobId.toString(), jobId);
        })
        .then(() => jobController.releasePayment(1))
        .then(tx => eventsHelper.extractEvents(tx, "PaymentReleased"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'PaymentReleased');
          const log = events[0].args;
          assert.equal(log.self, jobController.address);
          assert.equal(log.jobId.toString(), jobId);
        })
    });

    it('should emit all events on a workflow with canceled job', () => {
      const jobId = '1'
      const skillsArea = '4';
      const skillsCategory = '4';
      const skills = '555';
      const jobDetails = "Job details";

      const workerRate = '0x12f2a36ecd555';
      const workerOnTop = '0x12f2a36ecd555';
      const jobEstimate = 180;

      const additionalTime = 60

      return Promise.resolve()
        // Post job
        .then(() => jobController.postJob(jobFlow, skillsArea, skillsCategory, skills, jobDefaultPaySize, jobDetails, {from: client}))
        .then(tx => eventsHelper.extractEvents(tx, "JobPosted"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'JobPosted');
          const log = events[0].args;
          assert.equal(log.self, jobController.address);
          assert.equal(log.jobId.toString(), jobId);
          assert.equal(log.client, client);
          assert.equal(log.skillsArea.toString(), skillsArea);
          assert.equal(log.skillsCategory.toString(), skillsCategory);
          assert.equal(log.skills.toString(), skills);
          // TODO: handle hash matches
        })
        // Post job offer
        .then(() => jobController.postJobOffer(
          jobId, workerRate, jobEstimate, workerOnTop, {from: worker}
          )
        )
        .then(tx => eventsHelper.extractEvents(tx, "JobOfferPosted"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'JobOfferPosted');
          const log = events[0].args;
          assert.equal(log.self, jobController.address);
          assert.equal(log.jobId.toString(), jobId);
          assert.equal(log.worker, worker);
          assert.equal('0x' + log.rate.toString(16), workerRate);
          assert.equal(log.estimate.toString(), jobEstimate);
          assert.equal('0x' + log.ontop.toString(16), workerOnTop);
        })
        // Accept job offer
        .then(async () => {
          const payment = await jobController.calculateLockAmountFor.call(worker, jobId)
          return await jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
        })
        .then(tx => eventsHelper.extractEvents(tx, "JobOfferAccepted"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'JobOfferAccepted');
          const log = events[0].args;
          assert.equal(log.self, jobController.address);
          assert.equal(log.jobId.toString(), jobId);
          assert.equal(log.worker, worker);
        })
        // Request start of work
        .then(() => jobController.startWork(jobId, {from: worker}))
        .then(tx => eventsHelper.extractEvents(tx, "StartWorkRequested"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'StartWorkRequested');
          const log = events[0].args;
          assert.equal(log.self, jobController.address);
          assert.equal(log.jobId.toString(), jobId);
        })
        // Confirm start of work
        .then(() => jobController.confirmStartWork(jobId, {from: client}))
        .then(tx => eventsHelper.extractEvents(tx, "WorkStarted"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'WorkStarted');
          const log = events[0].args;
          assert.equal(log.self, jobController.address);
          assert.equal(log.jobId.toString(), jobId);
        })
        // Pause work
        .then(() => jobController.pauseWork(jobId, {from: worker}))
        .then(tx => eventsHelper.extractEvents(tx, "WorkPaused"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'WorkPaused');
          const log = events[0].args;
          assert.equal(log.self, jobController.address);
          assert.equal(log.jobId.toString(), jobId);
        })
        // Resume work
        .then(() => jobController.resumeWork(jobId, {from: worker}))
        .then(tx => eventsHelper.extractEvents(tx, "WorkResumed"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'WorkResumed');
          const log = events[0].args;
          assert.equal(log.self, jobController.address);
          assert.equal(log.jobId.toString(), jobId);
        })
        // Add more time
        .then(async () => {
          return await jobController.submitAdditionalTimeRequest(jobId, additionalTime, { from: worker, })
        })
        .then(tx => eventsHelper.extractEvents(tx, "TimeRequestSubmitted"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'TimeRequestSubmitted');
          
          const log = events[0].args;
          assert.equal(log.self, jobController.address);
          assert.equal(log.jobId.toString(), jobId);
          assert.equal(log.time.toString(), additionalTime.toString());
        })
        .then(async () => {
          return await jobController.rejectAdditionalTimeRequest(jobId, { from: client, value: 0, })
        })
        .then(tx => eventsHelper.extractEvents(tx, "TimeRequestRejected"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'TimeRequestRejected');
          
          const log = events[0].args;
          assert.equal(log.self, jobController.address);
          assert.equal(log.jobId.toString(), jobId);
          assert.equal(log.time.toString(), additionalTime.toString());
        })
        // Request end of work
        .then(() => jobController.endWork(jobId, {from: worker}))
        .then(tx => eventsHelper.extractEvents(tx, "EndWorkRequested"))
        .then(events => {
            assert.equal(events.length, 1);
            assert.equal(events[0].address, multiEventsHistory.address);
            assert.equal(events[0].event, 'EndWorkRequested');
            const log = events[0].args;
            assert.equal(log.self, jobController.address);
            assert.equal(log.jobId.toString(), jobId);
        })
        // Cancel job
        .then(() => jobController.cancelJob(1, {from: client}))
        .then(tx => eventsHelper.extractEvents(tx, "JobCanceled"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'JobCanceled');
          const log = events[0].args;
          assert.equal(log.self, jobController.address);
          assert.equal(log.jobId.toString(), jobId);
        });
    });

  });


  describe('Reward release', () => {

    it("should NOT allow to cancel job if operation " +
       "was not allowed by Payment Processor", () => {
      const jobId = 1;
      const workerRate = 200000000000;
      const workerOnTop = 1000000000;
      const jobEstimate = 240;

      return Promise.resolve()
        .then(() => jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, 'Job details hash', {from: client}))
        .then(() => jobController.postJobOffer(
          jobId, workerRate, jobEstimate, workerOnTop, {from: worker}
        ))
        .then(async () => {
          const payment = await jobController.calculateLockAmountFor.call(worker, jobId)
          return await jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
        })
        .then(() => paymentProcessor.enableServiceMode())
        .then(() => paymentProcessor.serviceMode())
        .then(assert.isTrue)
        .then(() => jobController.cancelJob.call(jobId, {from: client}))
        .then(code => assert.equal(code.toNumber(), ErrorsNamespace.PAYMENT_PROCESSOR_OPERATION_IS_NOT_APPROVED))
    });

    it("should allow to cancel job if operation " +
       "was allowed by Payment Processor", () => {
      const jobId = 1;
      const workerRate = 200000000000;
      const workerOnTop = 1000000000;
      const jobEstimate = 240;

      return Promise.resolve()
        .then(() => jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, 'Job details', {from: client}))
        .then(() => jobController.postJobOffer(
          jobId, workerRate, jobEstimate, workerOnTop, {from: worker}
        ))
        .then(async () => {
          const payment = await jobController.calculateLockAmountFor.call(worker, jobId)
          return await jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
        })
        .then(() => paymentProcessor.enableServiceMode())
        .then(() => paymentProcessor.serviceMode())
        .then(assert.isTrue)
        .then(() => paymentProcessor.approve(jobId))
        .then(() => jobController.cancelJob.call(jobId, {from: client}))
        .then((code) => assert.equal(code, ErrorsNamespace.OK))
    });

    it("should NOT allow to release payment when operation was not allowed by Payment Processor", () => {
      const jobId = 1;
      const workerRate = 200000000000;
      const workerOnTop = 1000000000;
      const jobEstimate = 240;
      return Promise.resolve()
        .then(() => jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, 'Job details', {from: client}))
        .then(() => jobController.postJobOffer(
          jobId, workerRate, jobEstimate, workerOnTop, {from: worker}
        ))
        .then(async () => {
          const payment = await jobController.calculateLockAmountFor.call(worker, jobId)
          return await jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
        })
        .then(() => jobController.startWork(jobId, {from: worker}))
        .then(() => jobController.confirmStartWork(jobId, {from: client}))
        .then(() => jobController.endWork(jobId, {from: worker}))
        .then(() => jobController.confirmEndWork(jobId, {from: client}))

        .then(() => paymentProcessor.enableServiceMode())
        .then(() => paymentProcessor.serviceMode())
        .then(assert.isTrue)

        .then(() => jobController.releasePayment.call(jobId))
        .then((code) => assert.equal(code.toNumber(), ErrorsNamespace.PAYMENT_PROCESSOR_OPERATION_IS_NOT_APPROVED))
    });

    it("should allow to release payment when operation was allowed by Payment Processor", () => {
      const jobId = 1;
      const workerRate = 200000000000;
      const workerOnTop = 1000000000;
      const jobEstimate = 240;
      return Promise.resolve()
        .then(() => jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, 'Job details', {from: client}))
        .then(() => jobController.postJobOffer(
          jobId, workerRate, jobEstimate, workerOnTop, {from: worker}
        ))
        .then(async () => {
          const payment = await jobController.calculateLockAmountFor.call(worker, jobId)
          return await jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
        })
        .then(() => jobController.startWork(jobId, {from: worker}))
        .then(() => jobController.confirmStartWork(jobId, {from: client}))
        .then(() => jobController.endWork(jobId, {from: worker}))
        .then(() => jobController.confirmEndWork(jobId, {from: client}))

        .then(() => paymentProcessor.enableServiceMode())
        .then(() => paymentProcessor.serviceMode())
        .then(assert.isTrue)
        .then(() => paymentProcessor.approve(jobId))

        .then(() => jobController.releasePayment.call(jobId))
        .then((code) => assert.equal(code, ErrorsNamespace.OK))
    });

    it('should release just jobOfferOnTop on `cancelJob` on OFFER_ACCEPTED job stage', () => {
      const jobId = 1;
      const workerRate = 200000000000;
      const workerOnTop = 1000000000;
      const jobEstimate = 240;

      let clientBalanceBefore;
      let workerBalanceBefore;

      let payment

      return Promise.resolve()
        .then(() => jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, 'Job details', {from: client}))
        .then(() => jobController.postJobOffer(
          jobId, workerRate, jobEstimate, workerOnTop, {from: worker}
        ))
        .then(async () => {
          payment = await jobController.calculateLockAmountFor.call(worker, jobId)
          return await jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
        })
        .then(() => helpers.getEthBalance(client))
        .then(result => clientBalanceBefore = result)
        .then(() => helpers.getEthBalance(worker))
        .then(result => workerBalanceBefore = result)
        .then(() => jobController.cancelJob(jobId, {from: client}))
        .then(async tx => clientBalanceBefore = clientBalanceBefore.sub(await helpers.getTxExpences(tx.tx)))
        .then(() => helpers.getEthBalance(client))
        .then(result => assert.equal(result.toString(16), clientBalanceBefore.plus(payment.minus(workerOnTop)).toString(16)))
        .then(() => helpers.getEthBalance(worker))
        .then(result => assert.equal(result.toString(16), workerBalanceBefore.add(workerOnTop).toString(16)))
        .then(() => paymentGateway.getBalance(jobId))
        .then(result => assert.equal(result.toString(16), '0'));
    });

    it('should release just jobOfferOnTop on `cancelJob` on PENDING_START job stage', () => {
      const jobId = 1;
      const workerRate = 200000000000;
      const workerOnTop = 1000000000;
      const jobEstimate = 240;

      let clientBalanceBefore;
      let workerBalanceBefore;

      let payment

      return Promise.resolve()
        .then(() => jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, 'Job details', {from: client}))
        .then(() => jobController.postJobOffer(
          jobId, workerRate, jobEstimate, workerOnTop, {from: worker}
        ))
        .then(async () => {
          payment = await jobController.calculateLockAmountFor.call(worker, jobId)
          return await jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
        })
        .then(() => jobController.startWork(jobId, {from: worker}))
        .then(() => helpers.getEthBalance(client))
        .then(result => clientBalanceBefore = result)
        .then(() => helpers.getEthBalance(worker))
        .then(result => workerBalanceBefore = result)
        .then(() => jobController.cancelJob(jobId, {from: client}))
        .then(async tx => clientBalanceBefore = clientBalanceBefore.sub(await helpers.getTxExpences(tx.tx)))
        .then(() => helpers.getEthBalance(client))
        .then(result => assert.equal(result.toString(16), clientBalanceBefore.plus(payment.minus(workerOnTop)).toString(16)))
        .then(() => helpers.getEthBalance(worker))
        .then(result => assert.equal(result.toString(16), workerBalanceBefore.add(workerOnTop).toString(16)))
        .then(() => paymentGateway.getBalance(jobId))
        .then(result => assert.equal(result.toString(16), '0'));
    });

    it('should release jobOfferOnTop + 1 hour of work on `cancelJob` on STARTED job stage', () => {
      const jobId = 1;
      const workerRate = 200000000000;
      const workerOnTop = 1000000000;
      const jobEstimate = 240;

      var clientBalanceBefore;
      let workerBalanceBefore;

      const jobPaymentEstimate = workerRate * 60 + workerOnTop;
      let payment

      return Promise.resolve()
        .then(() => jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, 'Job details', {from: client}))
        .then(() => jobController.postJobOffer(
          jobId, workerRate, jobEstimate, workerOnTop, {from: worker}
        ))
        .then(async () => {
          payment = await jobController.calculateLockAmountFor.call(worker, jobId)
          return await jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
        })
        .then(() => jobController.startWork(jobId, {from: worker}))
        .then(() => jobController.confirmStartWork(jobId, {from: client}))
        .then(() => helpers.getEthBalance(client))
        .then(result => clientBalanceBefore = result)
        .then(() => helpers.getEthBalance(worker))
        .then(result => workerBalanceBefore = result)
        .then(() => jobController.cancelJob(jobId, {from: client}))
        .then(async tx => clientBalanceBefore = clientBalanceBefore.sub(await helpers.getTxExpences(tx.tx)))
        .then(() => helpers.getEthBalance(client))
        .then(result => assert.equal(result.toString(16), clientBalanceBefore.plus(payment.minus(jobPaymentEstimate)).toString(16)))
        .then(() => helpers.getEthBalance(worker))
        .then(result => assert.equal(result.toString(16), workerBalanceBefore.add(jobPaymentEstimate).toString(16)))
        .then(() => paymentGateway.getBalance(jobId))
        .then(result => assert.equal(result.toString(16), '0'));
    });

    it('should release jobOfferOnTop + 1 hour of work on `cancelJob` on PENDING_FINISH job stage', () => {
      const jobId = 1;
      const workerRate = 200000000000;
      const workerOnTop = 1000000000;
      const jobEstimate = 240;

      var clientBalanceBefore;
      let workerBalanceBefore;

      let payment

      const jobPaymentEstimate = workerRate * 60 + workerOnTop;

      return Promise.resolve()
        .then(() => jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, 'Job details', {from: client}))
        .then(() => jobController.postJobOffer(
          jobId, workerRate, jobEstimate, workerOnTop, {from: worker}
        ))
        .then(async () => {
          payment = await jobController.calculateLockAmountFor.call(worker, jobId)
          return await jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
        })
        .then(() => jobController.startWork(jobId, {from: worker}))
        .then(() => jobController.confirmStartWork(jobId, {from: client}))
        .then(() => jobController.endWork(jobId, {from: worker}))
        .then(() => helpers.getEthBalance(client))
        .then(result => clientBalanceBefore = result)
        .then(() => helpers.getEthBalance(worker))
        .then(result => workerBalanceBefore = result)
        .then(() => jobController.cancelJob(jobId, {from: client}))
        .then(async tx => clientBalanceBefore = clientBalanceBefore.sub(await helpers.getTxExpences(tx.tx)))
        .then(() => helpers.getEthBalance(client))
        .then(result => assert.equal(result.toString(16), clientBalanceBefore.plus(payment.minus(jobPaymentEstimate)).toString(16)))
        .then(() => helpers.getEthBalance(worker))
        .then(result => assert.equal(result.toString(16), workerBalanceBefore.add(jobPaymentEstimate).toString(16)))
        .then(() => paymentGateway.getBalance(jobId))
        .then(result => assert.equal(result.toString(16), '0'));
    });

    it("should release correct amount of tokens on `releasePayment` when worked for exactly the estimated time but have unaccepted time request", async () => {
      const workerOffer = defaultWorkerOffer
      const timeSpent = workerOffer.jobEstimate;
      const additionalTime = 95
      const jobPaymentEstimate = workerOffer.workerRate * (timeSpent + 60) + workerOffer.workerOnTop;

      return onReleasePayment({ 
        timeSpent: timeSpent, 
        jobPaymentEstimate: jobPaymentEstimate, 
        offer: workerOffer, 
        beforeEndWorkHook: async (jobId) => {
          await jobController.submitAdditionalTimeRequest(jobId, additionalTime, { from: worker, })

          await helpers.increaseTime(additionalTime * 60)
          await helpers.mine()

          return 0
        },
      });
    })

    it("should release correct amount of tokens on `releasePayment` when worked for exactly the estimated time with accepted time request", async () => {
      const workerOffer = defaultWorkerOffer
      const timeSpent = workerOffer.jobEstimate;
      const additionalTime = 95
      const jobPaymentEstimate = workerOffer.workerRate * (timeSpent + additionalTime) + workerOffer.workerOnTop;
      return onReleasePayment({ 
        timeSpent: timeSpent, 
        jobPaymentEstimate: jobPaymentEstimate, 
        offer: workerOffer, 
        beforeEndWorkHook: async (jobId) => {
          await jobController.submitAdditionalTimeRequest(jobId, additionalTime, { from: worker, })
          const additionalPayment = await jobController.calculateLock.call(worker, jobId, additionalTime, 0)
          await jobController.acceptAdditionalTimeRequest(jobId, additionalTime, { from: client, value: additionalPayment, })
          
          await helpers.increaseTime(additionalTime * 60)
          await helpers.mine()

          return additionalPayment
        },
      });
    })


    it('should release correct amount of tokens on `releasePayment` when worked for exactly the estimated time', () => {
      const workerOffer = defaultWorkerOffer
      const timeSpent = workerOffer.jobEstimate;
      const jobPaymentEstimate = workerOffer.workerRate * timeSpent + workerOffer.workerOnTop;
      return onReleasePayment({ timeSpent: timeSpent, jobPaymentEstimate: jobPaymentEstimate, offer: workerOffer, });
    });

    it('should release correct amount of tokens on `releasePayment` when' +
       'worked for more than an hour but less than estimated time', () => {
      const workerOffer = defaultWorkerOffer
      const timeSpent = 183;
      const jobPaymentEstimate = workerOffer.workerRate * timeSpent + workerOffer.workerOnTop;
      return onReleasePayment({ timeSpent: timeSpent, jobPaymentEstimate: jobPaymentEstimate, offer: workerOffer, });
    });

    it('should release correct amount of tokens on `releasePayment` when' +
       'worked for more than estimated time but less than estimated time and an hour', () => {
      const workerOffer = defaultWorkerOffer
      const timeSpent = 299;
      const jobPaymentEstimate = workerOffer.workerRate * timeSpent + workerOffer.workerOnTop;
      return onReleasePayment({ timeSpent: timeSpent, jobPaymentEstimate: jobPaymentEstimate, offer: workerOffer, });
    });

    it('should release possible maximum of tokens(estimate + 1 hour)' +
       'when worked for more than estimate and an hour', () => {
      const workerOffer = defaultWorkerOffer
      const timeSpent = 340;
      const jobPaymentEstimate = workerOffer.workerRate * (workerOffer.jobEstimate + 60) + workerOffer.workerOnTop;
      return onReleasePayment({ timeSpent: timeSpent, jobPaymentEstimate: jobPaymentEstimate, offer: workerOffer, });
    });

    it('should release minimum an hour of work on `releasePayment` when worked for less than an hour', () => {
      const workerOffer = defaultWorkerOffer
      const timeSpent = 17;
      const jobPaymentEstimate = workerOffer.workerRate * 60 + workerOffer.workerOnTop;
      return onReleasePayment({ timeSpent: timeSpent, jobPaymentEstimate: jobPaymentEstimate, offer: workerOffer, });
    });


    it('should release correct amount of tokens on `releasePayment` ' +
       'when worked for exactly the estimated time, with pauses/resumes', () => {
      const workerOffer = defaultWorkerOffer
      const timeSpent = 183;
      const jobPaymentEstimate = workerOffer.workerRate * timeSpent + workerOffer.workerOnTop;
      return onReleasePayment({ timeSpent: timeSpent, jobPaymentEstimate: jobPaymentEstimate, offer: workerOffer, });
    });

    it('should release correct amount of tokens on `releasePayment` when' +
       'worked for more than an hour but less than estimated time, with pauses/resumes', () => {
      const workerOffer = defaultWorkerOffer
      const timeSpent = 183;
      const jobPaymentEstimate = workerOffer.workerRate * timeSpent + workerOffer.workerOnTop;
      return onReleasePayment({ timeSpent: timeSpent, jobPaymentEstimate: jobPaymentEstimate, offer: workerOffer, });
    });

    it('should release correct amount of tokens on `releasePayment` when' +
       'worked for more than estimated time but less than estimated time and an hour, with pauses/resumes', () => {
      const workerOffer = defaultWorkerOffer
      const timeSpent = 299;
      const jobPaymentEstimate = workerOffer.workerRate * timeSpent + workerOffer.workerOnTop;
      return onReleasePayment({ 
        timeSpent: timeSpent, 
        jobPaymentEstimate: jobPaymentEstimate, 
        offer: workerOffer, 
        pauses: true,
      });
    });

    it('should release possible maximum of tokens(estimate + 1 hour)' +
       'when worked for more than estimate and an hour, with pauses/resumes', () => {
      const workerOffer = defaultWorkerOffer
      const timeSpent = 340;
      const jobPaymentEstimate = workerOffer.workerRate * (workerOffer.jobEstimate + 60) + workerOffer.workerOnTop;
      return onReleasePayment({ 
        timeSpent: timeSpent, 
        jobPaymentEstimate: jobPaymentEstimate, 
        offer: workerOffer, 
        pauses: true
      });
    });

    it('should release minimum an hour of work on `releasePayment`' +
       'when worked for less than an hour, with pauses/resumes', () => {
      const workerOffer = defaultWorkerOffer
      const timeSpent = 17;
      const jobPaymentEstimate = workerOffer.workerRate * 60 + workerOffer.workerOnTop;
      return onReleasePayment({ 
        timeSpent: timeSpent, 
        jobPaymentEstimate: jobPaymentEstimate, 
        offer: workerOffer, 
        pauses: true
      });
    });

  });

  describe('Jobs Data Provider', () => {
    const jobDetailsIPFSHash = "0x0011001100ff"
    const allSkills = web3.toBigNumber('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
    const allSkillsCategories = web3.toBigNumber('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
    const allSkillsAreas = web3.toBigNumber('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
    const allJobStates = web3.toBigNumber('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
    const allPausedStates = 2

    const additionalTime = 60

    const workerOffer = defaultWorkerOffer

    beforeEach(async () => {
      await jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, jobDetailsIPFSHash, { from: client, })
      await jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, jobDetailsIPFSHash, { from: client, })
      await jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, jobDetailsIPFSHash, { from: client2, })

      await jobController.postJobOffer(1, workerOffer.workerRate, workerOffer.jobEstimate, workerOffer.workerOnTop, { from: worker, })
      await jobController.postJobOffer(3, workerOffer.workerRate, workerOffer.jobEstimate, workerOffer.workerOnTop, { from: worker, })

      {
        const jobId = 3
        var payment = await jobController.calculateLockAmountFor(worker, jobId)
        await jobController.acceptOffer(jobId, worker, { from: client2, value: payment, })
        await jobController.startWork(jobId, { from: worker, })
        await jobController.confirmStartWork(jobId, { from: client2, })
      }

    })

    it("should have presetup values", async () => {
      assert.equal((await jobsDataProvider.getJobsCount.call()).toNumber(), 3)

      assert.lengthOf(
        (await jobsDataProvider.getJobs.call(
          allJobStates, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 1, 100
        )).removeZeros(),
        3
      )

      assert.lengthOf(
        (await jobsDataProvider.getJobForWorker.call(
          worker, allJobStates, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 0, 100
        )).removeZeros(),
        2
      )
      await asserts.throws( // there is no jobs for passed worker
        jobsDataProvider.getJobForWorker.call(
          stranger, allJobStates, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 0, 100
        )
      )
      assert.lengthOf(
        (await jobsDataProvider.getJobForWorker.call(
          worker, JobState.STARTED, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 0, 100
        )).removeZeros(),
        1
      )

      assert.lengthOf(
        (await jobsDataProvider.getJobsForClient.call(
          client, allJobStates, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 0, 100
        )).removeZeros(),
        2
      )
      assert.lengthOf(
        (await jobsDataProvider.getJobsForClient.call(
          client2, allJobStates, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 0, 100
        )).removeZeros(),
        1
      )

      assert.lengthOf(
        await jobsDataProvider.getJobsByIds.call([1]),
        JOBS_RESULT_OFFSET
      )

      assert.lengthOf(
        await jobsDataProvider.getJobsByIds.call([ 1, 2, ]),
        JOBS_RESULT_OFFSET * 2
      )

      assert.equal((await jobsDataProvider.getJobOffersCount.call(1)).toNumber(), 1)
      assert.equal((await jobsDataProvider.getJobOffersCount.call(2)).toNumber(), 0)
      assert.equal((await jobsDataProvider.getJobOffersCount.call(3)).toNumber(), 1)

      assert.lengthOf(
        (await jobsDataProvider.getJobOffers.call(1, 0, 100))[1].removeZeros(),
        1
      )
      assert.lengthOf(
        (await jobsDataProvider.getJobOffers.call(2, 0, 100))[1].removeZeros(),
        0
      )
      assert.lengthOf(
        (await jobsDataProvider.getJobOffers.call(3, 0, 100))[1].removeZeros(),
        1
      )

      assert.isFalse(await jobsDataProvider.isActivatedState(1, await jobsDataProvider.getJobState(1)))
      assert.isTrue(await jobsDataProvider.isActivatedState(3, await jobsDataProvider.getJobState(3)))

      // check `_timeRequested` parameter
      {
        const jobId = 3
        {
          const jobsDetails = await jobsDataProvider.getJobsByIds.call([jobId])
          assert.equal(
            (await mock.convertBytes32ToUInt(jobsDetails[1*ADDITIONAL_TIME_REQUESTED_IDX])).toString(16),
            '0'
          )
        }
        {
          await jobController.submitAdditionalTimeRequest(jobId, additionalTime, { from: worker, })
          const jobsDetails = await jobsDataProvider.getJobsByIds.call([jobId])
          assert.equal(
            (await mock.convertBytes32ToUInt(jobsDetails[1*ADDITIONAL_TIME_REQUESTED_IDX])).toString(16),
            additionalTime.toString(16)
          )
        }
        {
          await jobController.rejectAdditionalTimeRequest(jobId, { from: client2, })
          const jobsDetails = await jobsDataProvider.getJobsByIds.call([jobId])
          assert.equal(
            (await mock.convertBytes32ToUInt(jobsDetails[1*ADDITIONAL_TIME_REQUESTED_IDX])).toString(16),
            '0'
          )
        }
      }
    })

    it("should have update values after job's state changed", async () => {
      await jobController.cancelJob(3, { from: client2, })
      await jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, jobDetailsIPFSHash, { from: client2, })

      assert.equal((await jobsDataProvider.getJobsCount.call()).toNumber(), 4)

      assert.lengthOf(
        (await jobsDataProvider.getJobs.call(
          allJobStates, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 1, 100
        )).removeZeros(),
        4
      )

      assert.lengthOf(
        (await jobsDataProvider.getJobForWorker.call(
          worker, allJobStates, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 0, 100
        )).removeZeros(),
        2
      )
      assert.lengthOf(
        (await jobsDataProvider.getJobForWorker.call(
          worker, JobState.STARTED, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 0, 100
        )).removeZeros(),
        0
      )
      assert.lengthOf(
        (await jobsDataProvider.getJobForWorker.call(
          worker, JobState.FINALIZED, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 0, 100
        )).removeZeros(),
        1
      )

      assert.lengthOf(
        (await jobsDataProvider.getJobsForClient.call(
          client, allJobStates, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 0, 100
        )).removeZeros(),
        2
      )
      assert.lengthOf(
        (await jobsDataProvider.getJobsForClient.call(
          client2, allJobStates, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 0, 100
        )).removeZeros(),
        2
      )

      assert.isFalse(await jobsDataProvider.isActivatedState(1, await jobsDataProvider.getJobState(1)))
      assert.isTrue(await jobsDataProvider.isActivatedState(3, await jobsDataProvider.getJobState(3)))
    })

    it("check values from filters", async () => {
      {
        const jobs = (await jobsDataProvider.getJobs.call(
          allJobStates, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 1, 30
        )).removeZeros()
        assert.equal(jobs.toString(), [ 1, 2, 3, ].toString())
      }
      {
        const jobs = (await jobsDataProvider.getJobs.call(
          allJobStates, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 1, 1
        )).removeZeros()
        assert.equal(jobs.toString(), [1].toString())
      }
      {
        const jobs = (await jobsDataProvider.getJobForWorker.call(
          worker, allJobStates, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 0, 100
        )).removeZeros()
        assert.equal(jobs.toString(), [ 1, 3, ].toString())
      }
      {
        const jobs = (await jobsDataProvider.getJobForWorker.call(
          worker, allJobStates, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 0, 1
        )).removeZeros()
        assert.equal(jobs.toString(), [1].toString())
      }
      {
        const jobs = (await jobsDataProvider.getJobsForClient.call(
          client, allJobStates, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 0, 100
        )).removeZeros()
        assert.equal(jobs.toString(), [ 1, 2, ].toString())
      }
      {
        const jobs = (await jobsDataProvider.getJobsForClient.call(
          client, allJobStates, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 0, 1
        )).removeZeros()
        assert.equal(jobs.toString(), [1].toString())
      }
      {
        const jobs = (await jobsDataProvider.getJobsForClient.call(
          client, JobState.STARTED, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 0, 1
        )).removeZeros()
        assert.equal(jobs.toString(), [].toString())
      }
      {
        const [ , _workers, _rates, _estimates, _ontops, _offerPostedAt, ] = await jobsDataProvider.getJobOffers.call(1, 0, 100)
        assert.equal(_workers.length, _rates.length)
        assert.equal(_workers.length, _estimates.length)
        assert.equal(_workers.length, _ontops.length)
        assert.equal(_workers.length, _offerPostedAt.length)
        assert.lengthOf(_workers, 1)
        assert.equal(_workers.toString(), [worker].toString())
        assert.equal(_rates.toString(), [workerOffer.workerRate].toString())
        assert.equal(_estimates.toString(), [workerOffer.jobEstimate].toString())
        assert.equal(_ontops.toString(), [workerOffer.workerOnTop].toString())
        assert.notEqual(_offerPostedAt.toString(), [0].toString())
      }
    })

    it("check values from filters after changes", async () => {
      await jobController.cancelJob(3, { from: client2, })
      await jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, jobDetailsIPFSHash, { from: client2, })

      {
        const jobs = (await jobsDataProvider.getJobs.call(
          allJobStates, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 1, 100
        )).removeZeros()
        assert.equal(jobs.toString(), [ 1, 2, 3, 4, ].toString())
      }
      {
        const jobs = (await jobsDataProvider.getJobs.call(
          JobState.FINALIZED, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 1, 100
        )).removeZeros()
        assert.equal(jobs.toString(), [3].toString())
      }
      {
        const jobs = (await jobsDataProvider.getJobForWorker.call(
          worker, allJobStates, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 0, 100
        )).removeZeros()
        assert.equal(jobs.toString(), [ 1, 3, ].toString())
      }
      {
        const jobs = (await jobsDataProvider.getJobForWorker.call(
          worker, allJobStates, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 0, 1
        )).removeZeros()
        assert.equal(jobs.toString(), [1].toString())
      }
      {
        const jobs = (await jobsDataProvider.getJobsForClient.call(
          client2, allJobStates, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 0, 100
        )).removeZeros()
        assert.equal(jobs.toString(), [ 3, 4, ].toString())
      }
      {
        const jobs = (await jobsDataProvider.getJobsForClient.call(
          client2, allJobStates, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 0, 1
        )).removeZeros()
        assert.equal(jobs.toString(), [3].toString())
      }
      {
        const jobs = (await jobsDataProvider.getJobsForClient.call(
          client2, JobState.FINALIZED, allSkillsAreas, allSkillsCategories, allSkills, allPausedStates, 0, 1
        )).removeZeros()
        assert.equal(jobs.toString(), [3].toString())
      }

      {
        const [ , _beforeWorkers, _beforeRates, _beforeEstimates, _beforeOntops, _beforeOfferPostedAt, ] = await jobsDataProvider.getJobOffers.call(1, 0, 100)
        const [ _newWorkerRate, _newWorkerEstimates, _newWorkerOntops, ] = [ workerOffer.workerRate + 10000, workerOffer.jobEstimate + 20000, workerOffer.workerOnTop - 15000, ]
        const jobOfferTx = await jobController.postJobOffer(1, _newWorkerRate , _newWorkerEstimates, _newWorkerOntops, { from: worker, })
        const [ , _afterWorkers, _afterRates, _afterEstimates, _afterOntops, _afterOfferPostedAt, ] = await jobsDataProvider.getJobOffers.call(1, 0, 100)

        assert.equal(_beforeWorkers.length, _afterWorkers.length)
        assert.equal(_beforeRates.length, _afterRates.length)

        const _workerIdx = _beforeWorkers.indexOf(worker)
        assert.notEqual(_workerIdx, -1)

        const jobOfferBlock = web3.eth.getBlock(jobOfferTx.receipt.blockNumber)
        const expectedJobOfferUpdatedAt = jobOfferBlock.timestamp
        assert.equal(_afterWorkers[_workerIdx], worker)
        assert.equal(_afterRates[_workerIdx].toString(), _newWorkerRate.toString())
        assert.equal(_afterEstimates[_workerIdx].toString(), _newWorkerEstimates.toString())
        assert.equal(_afterOntops[_workerIdx].toString(), _newWorkerOntops.toString())
        assert.equal(_afterOfferPostedAt[_workerIdx].toString(), expectedJobOfferUpdatedAt.toString())
      }
    })
  })

});
