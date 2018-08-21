"use strict";

const BalanceHolder = artifacts.require('BalanceHolder')
const JobController = artifacts.require('JobController')
const JobsDataProvider = artifacts.require('JobsDataProvider')
const BoardController = artifacts.require('BoardController')
const Mock = artifacts.require('Mock')
const MultiEventsHistory = artifacts.require('MultiEventsHistory')
const PaymentGateway = artifacts.require('PaymentGateway')
const PaymentProcessor = artifacts.require('PaymentProcessor')
const Roles2Library = artifacts.require('Roles2Library')
const Roles2LibraryInterface = artifacts.require('Roles2LibraryInterface')
const Storage = artifacts.require('Storage')
const UserLibrary = artifacts.require('UserLibrary')

const Asserts = require('./helpers/asserts');
const Reverter = require('./helpers/reverter');
const eventsHelper = require('./helpers/eventsHelper');

const helpers = require('./helpers/helpers');
const ErrorsNamespace = require('../common/errors')


contract("JobController workflows", accounts => {
	const reverter = new Reverter(web3);
	const asserts = Asserts(assert);

	const roles2LibraryInterface = web3.eth.contract(Roles2LibraryInterface.abi).at('0x0');
	const userLibraryInterface = web3.eth.contract(UserLibrary.abi).at('0x0');

	const client = accounts[1];
	const worker = accounts[2];
	const stranger = accounts[9];

	const contracts = {
		storage: null,
  		jobController: null,
  		jobsDataProvider: null,
  		boardController: null,
  		multiEventsHistory: null,
  		paymentProcessor: null,
  		userLibrary: null,
  		paymentGateway: null,
  		balanceHolder: null,
  		mock: null,
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

	const Workflow = {
		TM_WITHOUT_CONFIRMATION: web3.toBigNumber(1),
		TM_WITH_CONFIRMATION: web3.toBigNumber(2).pow(255).add(1),
		FIXED_PRICE: web3.toBigNumber(2),
	}

	const jobDefaultPaySize = 90;
	const jobDetailsIPFSHash = "hash of job's data"
  
	const assertInternalBalance = async (address, expectedValue) => {
		asserts.equal(expectedValue)(await contracts.paymentGateway.getBalance(address))
	}

	const assertEthBalance = async (address, expectedValue) => {
		asserts.equal(expectedValue)(await helpers.getEthBalance(address))
	}

	const ignoreAuth = async (enabled = true) => {
		if (enabled) {
			await contracts.jobController.setRoles2Library(Roles2Library.address)
		} else {
			await contracts.jobController.setRoles2Library(contracts.mock.address)
		}
	}

	const ignoreSkillsCheck = async (enabled = true) => {
		await contracts.mock.ignore(userLibraryInterface.hasSkills.getData(0,0,0,0).slice(0, 10), enabled);
	}

	const tmWithoutConfirmationOperationAllowance = (operation, args, results) => {
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
		const additionalTime = 60;
	
		const workerRate = '0x12f2a36ecd555';
		const workerOnTop = '0x12f2a36ecd555';
		const jobEstimate = 180;
	
		return Promise.resolve()
			// Represents full chain of interactions between client and worker
			// Provided `operation` will try to execute on each stage, comparing with expected results
			
			.then(() => contracts.jobController.postJob(Workflow.TM_WITHOUT_CONFIRMATION, jobArea, jobCategory, jobSkills, jobDefaultPaySize, jobDetailsIPFSHash, { from: client, }))
			.then(() => operation.call(...args))
			.then(result => assert.equal(result.toNumber(), stages.CREATED))
		
			.then(() => contracts.jobController.postJobOffer(jobId, workerRate, jobEstimate, workerOnTop, { from: worker, }))
			.then(async () => {
				const payment = await contracts.jobController.calculateLockAmountFor(worker, jobId)
				return await contracts.jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
			})
			.then(() => operation.call(...args))
			.then(result => assert.equal(result.toNumber(), stages.OFFER_ACCEPTED))
		
			.then(() => contracts.jobController.startWork(jobId, { from: worker, }))
			.then(() => operation.call(...args))
			.then(result => assert.equal(result.toNumber(), stages.PENDING_START))
		
			// .then(() => contracts.jobController.confirmStartWork(jobId, { from: client, }))
			// .then(() => operation.call(...args))
			// .then(result => assert.equal(result.toNumber(), stages.STARTED))
		
			.then(() => contracts.jobController.endWork(jobId, { from: worker, }))
			.then(() => operation.call(...args))
			.then(result => assert.equal(result.toNumber(), stages.PENDING_FINISH))
		
			// .then(() => contracts.jobController.confirmEndWork(jobId, { from: client, }))
			// .then(() => operation.call(...args))
			// .then(result => assert.equal(result.toNumber(), stages.FINISHED))
		
			.then(() => contracts.jobController.releasePayment(jobId))
			.then(() => operation.call(...args))
			.then(result => assert.equal(result.toNumber(), stages.FINALIZED));
	}

	const fixedPriceOperationAllowance = async (operation, args, results, accepts = true) => {
		let stages = {
			CREATED: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE,
			OFFER_ACCEPTED: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE,
			PENDING_START: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE,
			PENDING_FINISH: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE,
			WORK_ACCEPTED: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE,
			WORK_REJECTED: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE,
			FINALIZED: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE
		};
	
		for (let stage in results) {
			stages[stage] = results[stage];
		}
	
		const jobId = 1;
		const jobArea = 4;
		const jobCategory = 4;
		const jobSkills = 4;
	
		const workerRate = '0x12f2a36ecd555';
		
		// Represents full chain of interactions between client and worker
		// Provided `operation` will try to execute on each stage, comparing with expected results
		
		await contracts.jobController.postJob(Workflow.FIXED_PRICE, jobArea, jobCategory, jobSkills, jobDefaultPaySize, jobDetailsIPFSHash, { from: client, })
		assert.equal((await operation.call(...args)).toNumber(), stages.CREATED)
	
		await contracts.jobController.postJobOfferWithPrice(jobId, workerRate, { from: worker, })
		const payment = await contracts.jobController.calculateLockAmountFor(worker, jobId)
		await contracts.jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
		assert.equal((await operation.call(...args)).toNumber(), stages.OFFER_ACCEPTED)
	
		await contracts.jobController.startWork(jobId, { from: worker, })
		assert.equal((await operation.call(...args)).toNumber(), stages.PENDING_START)
	
		await contracts.jobController.endWork(jobId, { from: worker, })
		assert.equal((await operation.call(...args)).toNumber(), stages.PENDING_FINISH)

		if (accepts) {
			await contracts.jobController.acceptWorkResults(jobId, { from: client, })
			assert.equal((await operation.call(...args)).toNumber(), stages.WORK_ACCEPTED)

			await contracts.jobController.releasePayment(jobId)
			assert.equal((await operation.call(...args)).toNumber(), stages.FINALIZED)
		} else {
			await contracts.jobController.rejectWorkResults(jobId, { from: client, })
			assert.equal((await operation.call(...args)).toNumber(), stages.WORK_REJECTED)

			await contracts.jobController.resolveWorkDispute(jobId, payment, 0)
			assert.equal((await operation.call(...args)).toNumber(), stages.FINALIZED)	
		}
	}

	const tm_onReleasePayment = async (params, timeSpent, jobPaymentEstimate, pauses) => {
		const { jobId, workerRate, workerOnTop, jobEstimate, } = params
		let clientBalanceBefore;
		let workerBalanceBefore;
	
		const timeOps = async () => {
			if (pauses) {
				await helpers.increaseTime(timeSpent / 2 * 60)
				await helpers.mine()
				await contracts.jobController.pauseWork(jobId, { from: worker, })
				await helpers.increaseTime(30 * 60)
				await helpers.mine()
				await contracts.jobController.resumeWork(jobId, { from: worker, })
				await helpers.increaseTime(timeSpent / 2 * 60)
				await helpers.mine()
			} else {
				await helpers.increaseTime(timeSpent * 60)
				await helpers.mine()
			}
		}

		clientBalanceBefore = await contracts.paymentGateway.getBalance(client)
		workerBalanceBefore = await contracts.paymentGateway.getBalance(worker)
		
		await contracts.jobController.postJob(Workflow.TM_WITHOUT_CONFIRMATION, 4, 4, 4, jobDefaultPaySize, jobDetailsIPFSHash, { from: client, })
		await contracts.jobController.postJobOffer(jobId, workerRate, jobEstimate, workerOnTop, { from: worker, })
		const payment = await contracts.jobController.calculateLockAmountFor.call(worker, jobId)
		await contracts.jobController.acceptOffer(jobId, worker, { from: client, value: payment, })

		await assertInternalBalance(client, clientBalanceBefore)
		await assertInternalBalance(jobId, payment)
		
		await contracts.jobController.startWork(jobId, { from: worker, })
		await timeOps()
		await contracts.jobController.endWork(jobId, { from: worker, })

		const clientEthBalanceBefore = await helpers.getEthBalance(client)
		const workerEthBalanceBefore = await helpers.getEthBalance(worker)

		await contracts.jobController.releasePayment(jobId)

		await assertInternalBalance(client, clientBalanceBefore)
		await assertInternalBalance(worker, workerBalanceBefore)
		await assertEthBalance(client, clientEthBalanceBefore.add(payment.minus(jobPaymentEstimate)))
		await assertEthBalance(worker, workerEthBalanceBefore.add(jobPaymentEstimate))
		await assertInternalBalance(jobId, 0)
	}

	function EventTester(params) {
		assert.isDefined(params.jobFlow)
		const jobFlow = params.jobFlow

		const jobId = params.jobId || '1'
		const skillsArea = params.skillsArea || '4';
		const skillsCategory = params.skillsCategory || '4';
		const skills = params.skills || '555';
	
		const workerRate = params.workerRate || '0x12f2a36ecd555';
		const workerOnTop = params.workerOnTop || '0x12f2a36ecd555';
		const jobEstimate = params.jobEstimate || 180;

		this._testJobPosted = () => {
			it("should emit 'JobPosted' event on posting a job", async () => {
				const tx = await contracts.jobController.postJob(jobFlow, skillsArea, skillsCategory, skills, jobDefaultPaySize, jobDetailsIPFSHash, { from: client, })

				const events = eventsHelper.extractEvents(tx, "JobPosted")
				assert.equal(events.length, 1);
				assert.equal(events[0].address, contracts.multiEventsHistory.address);
				assert.equal(events[0].event, 'JobPosted');
				
				const log = events[0].args;
				assert.equal(log.self, contracts.jobController.address);
				assert.equal(log.jobId.toString(), jobId);
				assert.equal(log.flowType, await contracts.mock.convertUIntToBytes32.call(jobFlow))
				assert.equal(log.client, client);
				assert.equal(log.skillsArea.toString(), skillsArea);
				assert.equal(log.skillsCategory.toString(), skillsCategory);
				assert.equal(log.skills.toString(), skills);
				assert.equal(log.defaultPay.toString(), jobDefaultPaySize.toString())
				assert.equal(log.detailsIPFSHash, await contracts.mock.convertToBytes32.call(jobDetailsIPFSHash))
				assert.equal(log.bindStatus, false)
			})
		}

		this._testTMJobOfferPosted = () => {
			it("should emit 'JobOfferPosted' event on posting a job offer", async () => {
				const tx = await contracts.jobController.postJobOffer(jobId, workerRate, jobEstimate, workerOnTop, { from: worker, })

				const events = eventsHelper.extractEvents(tx, "JobOfferPosted")
				assert.equal(events.length, 1);
				assert.equal(events[0].address, contracts.multiEventsHistory.address);
				assert.equal(events[0].event, 'JobOfferPosted');

				const log = events[0].args;
				assert.equal(log.self, contracts.jobController.address);
				assert.equal(log.jobId.toString(), jobId);
				assert.equal(log.worker, worker);
				assert.equal('0x' + log.rate.toString(16), workerRate);
				assert.equal(log.estimate.toString(), jobEstimate);
				assert.equal('0x' + log.ontop.toString(16), workerOnTop);
			})
		}

		this._testFixedPriceJobOfferPosted = () => {
			it("should emit 'JobOfferPosted' event on posting a job offer with fixed price", async () => {
				const tx = await contracts.jobController.postJobOfferWithPrice(jobId, workerRate, { from: worker, })
				
				const events = eventsHelper.extractEvents(tx, "JobOfferPosted")
				assert.equal(events.length, 1);
				assert.equal(events[0].address, contracts.multiEventsHistory.address);
				assert.equal(events[0].event, 'JobOfferPosted');

				const log = events[0].args;
				assert.equal(log.self, contracts.jobController.address);
				assert.equal(log.jobId.toString(), jobId);
				assert.equal(log.worker, worker);
				assert.equal('0x' + log.price.toString(16), workerRate);
				assert.isUndefined(log.estimate);
				assert.isUndefined(log.ontop);
			})
		}

		this._testJobOfferAccepted = () => {
			it("should emit 'JobOfferAccepted' event on accepting an offer", async () => {
				const payment = await contracts.jobController.calculateLockAmountFor.call(worker, jobId)
				const tx = await contracts.jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
				
				const events = eventsHelper.extractEvents(tx, "JobOfferAccepted")
				assert.equal(events.length, 1);
				assert.equal(events[0].address, contracts.multiEventsHistory.address);
				assert.equal(events[0].event, 'JobOfferAccepted');

				const log = events[0].args;
				assert.equal(log.self, contracts.jobController.address);
				assert.equal(log.jobId.toString(), jobId);
				assert.equal(log.worker, worker);
			})
		}

		this._testStartWorking = () => {
			it("should NOT emit any event on starting work by a worker", async () => {
				const tx = await contracts.jobController.startWork(jobId, { from: worker, })
				const events = eventsHelper.extractEvents(tx, "WorkStarted")
				assert.equal(events.length, 0)
			})
		}

		this._testConfirmStartWork = () => {
			it("should emit 'WorkStarted' event on confirming work stated by a client", async () => {
				const tx = await contracts.jobController.confirmStartWork(jobId, { from: client, })

				const events = eventsHelper.extractEvents(tx, "WorkStarted")
				assert.equal(events.length, 1);
				assert.equal(events[0].address, contracts.multiEventsHistory.address);
				assert.equal(events[0].event, 'WorkStarted');

				const log = events[0].args;
				assert.equal(log.self, contracts.jobController.address);
				assert.equal(log.jobId.toString(), jobId);
			})
		}

		this._testWorkPaused = () => {
			it("should emit 'WorkPaused' event on pausing a work", async () => {
				const tx = await contracts.jobController.pauseWork(jobId, { from: worker, })
				
				const events = eventsHelper.extractEvents(tx, "WorkPaused")
				assert.equal(events.length, 1);
				assert.equal(events[0].address, contracts.multiEventsHistory.address);
				assert.equal(events[0].event, 'WorkPaused');
				
				const log = events[0].args;
				assert.equal(log.self, contracts.jobController.address);
				assert.equal(log.jobId.toString(), jobId);
			})
		}

		this._testWorkResumed = () => {
			it("should emit 'WorkResumed' event on resuming a work", async () => {
				const tx = await contracts.jobController.resumeWork(jobId, { from: worker, })

				const events = eventsHelper.extractEvents(tx, "WorkResumed")
				assert.equal(events.length, 1);
				assert.equal(events[0].address, contracts.multiEventsHistory.address);
				assert.equal(events[0].event, 'WorkResumed');

				const log = events[0].args;
				assert.equal(log.self, contracts.jobController.address);
				assert.equal(log.jobId.toString(), jobId);
			})
		}

		this._testSubmitTimeRequest = () => {
			it("should emit 'TimeRequestSubmitted' event on accepting more time request", async () => {
				const additionalTime = 60
				const tx = await contracts.jobController.submitAdditionalTimeRequest(jobId, additionalTime, { from: worker, })
				
				const events = eventsHelper.extractEvents(tx, "TimeRequestSubmitted")
				assert.equal(events.length, 1);
				assert.equal(events[0].address, contracts.multiEventsHistory.address);
				assert.equal(events[0].event, 'TimeRequestSubmitted');
				
				const log = events[0].args;
				assert.equal(log.self, contracts.jobController.address);
				assert.equal(log.jobId.toString(), jobId);
				assert.equal(log.time.toString(), additionalTime.toString());
			})
		}

		this._testAcceptTimeRequest = () => {
			it("should emit 'TimeRequestAccepted' event on accepting more time request", async () => {
				const additionalTime = 60
				const additionalPayment = await contracts.jobController.calculateLock.call(worker, jobId, additionalTime, 0)
				const tx = await contracts.jobController.acceptAdditionalTimeRequest(jobId, additionalTime, { from: client, value: additionalPayment, })
				
				const events = eventsHelper.extractEvents(tx, "TimeRequestAccepted")
				assert.equal(events.length, 1);
				assert.equal(events[0].address, contracts.multiEventsHistory.address);
				assert.equal(events[0].event, 'TimeRequestAccepted');
				
				const log = events[0].args;
				assert.equal(log.self, contracts.jobController.address);
				assert.equal(log.jobId.toString(), jobId);
				assert.equal(log.time.toString(), additionalTime.toString());
			})
		}

		this._testRejectTimeRequest = () => {
			it("should emit 'TimeRequestRejected' event on accepting more time request", async () => {
				const additionalTime = 60
				const tx = await contracts.jobController.rejectAdditionalTimeRequest(jobId, { from: client, })
				
				const events = eventsHelper.extractEvents(tx, "TimeRequestRejected")
				assert.equal(events.length, 1);
				assert.equal(events[0].address, contracts.multiEventsHistory.address);
				assert.equal(events[0].event, 'TimeRequestRejected');
				
				const log = events[0].args;
				assert.equal(log.self, contracts.jobController.address);
				assert.equal(log.jobId.toString(), jobId);
				assert.equal(log.time.toString(), additionalTime.toString());
			})
		}
		
		this._testEndWorking = () => {
			it("should NOT emit any event on requesting end of work by a worker", async () => {
				const tx = await contracts.jobController.endWork(jobId, { from: worker, })
				const events = eventsHelper.extractEvents(tx, "WorkFinished")
				assert.equal(events.length, 0)
			})
		}
		
		this._testConfirmEndWork = () => {
			it("should emit 'WorkFinished' event on confirming work ended by a client", async () => {
				const tx = await contracts.jobController.confirmEndWork(jobId, { from: client, })
				
				const events = eventsHelper.extractEvents(tx, "WorkFinished")
				assert.equal(events.length, 1);
				assert.equal(events[0].address, contracts.multiEventsHistory.address);
				assert.equal(events[0].event, 'WorkFinished');
				
				const log = events[0].args;
				assert.equal(log.self, contracts.jobController.address);
				assert.equal(log.jobId.toString(), jobId);
			})
		}
		
		this._testJobCancelled = () => {
			it("should emit 'JobCanceled' event on cancelling job", async () => {
				const tx = await contracts.jobController.cancelJob(jobId, { from: client, })

				const events = eventsHelper.extractEvents(tx, "JobCanceled")
				assert.equal(events.length, 1);
				assert.equal(events[0].address, contracts.multiEventsHistory.address);
				assert.equal(events[0].event, 'JobCanceled');

				const log = events[0].args;
				assert.equal(log.self, contracts.jobController.address);
				assert.equal(log.jobId.toString(), jobId);
			})
		}

		this._testAcceptWorkResults = () => {
			it("should emit 'WorkAccepted' event on accepting work results", async () => {
				const tx = await contracts.jobController.acceptWorkResults(jobId, { from: client, })

				const events = eventsHelper.extractEvents(tx, "WorkAccepted")
				assert.equal(events.length, 1);
				assert.equal(events[0].address, contracts.multiEventsHistory.address);
				assert.equal(events[0].event, 'WorkAccepted');

				const log = events[0].args;
				assert.equal(log.self, contracts.jobController.address);
				assert.equal(log.jobId.toString(), jobId);
			})
		}

		this._testRejectWorkResults = () => {
			it("should emit 'WorkRejected' event on rejecting work results", async () => {
				const tx = await contracts.jobController.rejectWorkResults(jobId, { from: client, })

				const events = eventsHelper.extractEvents(tx, "WorkRejected")
				assert.equal(events.length, 1);
				assert.equal(events[0].address, contracts.multiEventsHistory.address);
				assert.equal(events[0].event, 'WorkRejected');

				const log = events[0].args;
				assert.equal(log.self, contracts.jobController.address);
				assert.equal(log.jobId.toString(), jobId);
			})
		}

		this._testResolveWorkDispute = () => {
			it("should emit 'WorkDisputeResolved' event on resolving dispute of work results", async () => {
				const tx = await contracts.jobController.resolveWorkDispute(jobId, workerRate, 0)

				const events = eventsHelper.extractEvents(tx, "WorkDisputeResolved")
				assert.equal(events.length, 1);
				assert.equal(events[0].address, contracts.multiEventsHistory.address);
				assert.equal(events[0].event, 'WorkDisputeResolved');

				const log = events[0].args;
				assert.equal(log.self, contracts.jobController.address);
				assert.equal(log.jobId.toString(), jobId);
			})
		}

		this._testReleasePayment = () => {
			it("should emit 'PaymentReleased' event on releasing payment", async () => {
				const tx = await contracts.jobController.releasePayment(jobId)

				const events = eventsHelper.extractEvents(tx, "PaymentReleased")
				assert.equal(events.length, 1);
				assert.equal(events[0].address, contracts.multiEventsHistory.address);
				assert.equal(events[0].event, 'PaymentReleased');

				const log = events[0].args;
				assert.equal(log.self, contracts.jobController.address);
				assert.equal(log.jobId.toString(), jobId);
			})
		}
	}			

	before('setup', async () => {
		contracts.mock = await Mock.deployed()
		
		contracts.multiEventsHistory = await MultiEventsHistory.deployed()
		contracts.storage = await Storage.deployed()
		contracts.balanceHolder = await BalanceHolder.deployed()
		contracts.userLibrary = await UserLibrary.deployed()
		contracts.paymentGateway = await PaymentGateway.deployed()
		contracts.paymentProcessor = await PaymentProcessor.deployed()
		contracts.boardController = await BoardController.deployed()
		contracts.jobController = await JobController.deployed()
		contracts.jobsDataProvider = await JobsDataProvider.deployed()

		await ignoreAuth()
		await ignoreSkillsCheck()

		await contracts.paymentGateway.setupEventsHistory(contracts.multiEventsHistory.address)
		await contracts.paymentGateway.setBalanceHolder(contracts.balanceHolder.address)
		await contracts.paymentProcessor.setPaymentGateway(contracts.paymentGateway.address)
		await contracts.jobController.setPaymentProcessor(contracts.paymentProcessor.address)
		await contracts.jobController.setUserLibrary(contracts.mock.address)
		await contracts.jobController.setBoardController(contracts.boardController.address)

		await reverter.snapshot()
	})

	context('#postJob flowType validation', () => {

        afterEach(async () => await reverter.revert());

        it('should allow anyone to post a job with FIXED_PRICE flow type', async () => {
        	const result = await contracts.jobController.postJob.call(Workflow.FIXED_PRICE, 4, 4, 4, jobDefaultPaySize, jobDetailsIPFSHash, { from: accounts[0], });
            assert.equal(result.toNumber(), ErrorsNamespace.OK);
        });

        it('should allow anyone to post a job with TM_WITH_CONFIRMATION flow type', async () => {
            const result = await contracts.jobController.postJob.call(Workflow.TM_WITH_CONFIRMATION, 4, 4, 4, jobDefaultPaySize, jobDetailsIPFSHash, { from: accounts[0], });
			assert.equal(result.toNumber(), ErrorsNamespace.OK);
		});

        it('should allow anyone to post a job with TM_WITHOUT_CONFIRMATION flow type', async () => {
            const result = await contracts.jobController.postJob.call(Workflow.TM_WITHOUT_CONFIRMATION, 4, 4, 4, jobDefaultPaySize, jobDetailsIPFSHash, { from: accounts[0], });
			assert.equal(result.toNumber(), ErrorsNamespace.OK);
		});

        it('should throw JOB_CONTROLLER_INVALID_WORKFLOW_TYPE error code if flow type is incorrect', async () => {
        	const flowType = 777
            const result = await contracts.jobController.postJob.call(flowType, 4, 4, 4, jobDefaultPaySize, jobDetailsIPFSHash, { from: accounts[0], });
            assert.equal(result.toNumber(), ErrorsNamespace.JOB_CONTROLLER_INVALID_WORKFLOW_TYPE);
        });

	});

	context("TM without confirmation", () => {

		const jobFlow = Workflow.TM_WITHOUT_CONFIRMATION

		context("Job posting", () => {

			afterEach(async () => await reverter.revert())

			it('should allow anyone to post a job', async () => {
				for (const account of accounts) {
					assert.equal(
						(await contracts.jobController.postJob.call(jobFlow, 4, 4, 4, jobDefaultPaySize, jobDetailsIPFSHash, { from: account, })).toNumber(),
						ErrorsNamespace.OK
					)
				}
			})

			it('should allow to post a job several times by different users', async () => {
				const clients = accounts.slice(1, 4)
				const area = 1
				const category = 4
				const skills = 2
				const args = [ jobFlow, area, category, skills, jobDefaultPaySize, jobDetailsIPFSHash, ]

				for (const c of clients) {
					const tx = await contracts.jobController.postJob(...args, { from: c, })
					helpers.assertLogs([{
						event: "JobPosted",
						args: {
						  client: c,
						},
					}])(tx)
				}
				asserts.equal(clients.length)(await contracts.jobsDataProvider.getJobsCount())
			})
		})

		context("Post job offer", () => {
			const jobId = 1;

			beforeEach(async () => {
				await contracts.jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, jobDetailsIPFSHash, { from: client, })
			})

			afterEach(async () => await reverter.revert())

			it('should NOT a post job offer with null rate', async () => {
				assert.equal(
					(await contracts.jobController.postJobOffer.call(jobId, 0, 1, 1, { from: worker, })).toNumber(),
					ErrorsNamespace.JOB_CONTROLLER_INVALID_ESTIMATE
				)
			})

			it("should not post Fixed-Priced job offer for a TM job", async () => {
				const rate = 100000;
				/**
				 * With these values,  ((rate * (estimate + 60) + ontop) / 10) * 11  will equal near the uint256 value
				 */
				assert.equal(
					(await contracts.jobController.postJobOfferWithPrice.call(jobId, rate, { from: worker, })).toNumber(),
					ErrorsNamespace.JOB_CONTROLLER_INVALID_WORKFLOW_TYPE
				)
			})

			it('should NOT post a job offer when rate/estimate/ontop overflow', async () => {
				const rate = '0x1D1745D1745D1745D1745D1745D1745D1745D1745D1745D1745D1745D1745D1';
				const estimate = 68;
				const ontop = 60;
				/**
				 * With these values,  ((rate * (estimate + 60) + ontop) / 10) * 11  will equal (uint256 + 3)
				 */
				assert.equal(
					(await contracts.jobController.postJobOffer.call(jobId, rate, estimate, ontop, { from: worker, })).toNumber(),
					ErrorsNamespace.JOB_CONTROLLER_INVALID_ESTIMATE
				)
			})

			it('should allow to post a job offer when lock amount is almost the maximum uint256 value', async () => {
				const rate = '0x1D1745D1745D1745D1745D1745D1745D1745D1745D1745D1745D1745D1745D1';
				const estimate = 68;
				const ontop = 59;
				/**
				 * With these values,  ((rate * (estimate + 60) + ontop) / 10) * 11  will equal near the uint256 value
				 */
				assert.equal(
					(await contracts.jobController.postJobOffer.call(jobId, rate, estimate, ontop, { from: worker, })).toNumber(),
					ErrorsNamespace.OK
				)
			})

			it("should allow to post job offer with no ontop payment", async () => {
				assert.equal(
					(await contracts.jobController.postJobOffer.call(jobId, '0xfffffffffffffffffff', 1, 0, { from: worker, })).toNumber(),
					ErrorsNamespace.OK
				)
			});
		})

		context("Accept job offer", () => {
			afterEach(async () => await reverter.revert())

			describe("and fail when", () => {
				const jobId = 1;

				beforeEach(async () => {
					await contracts.jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, jobDetailsIPFSHash, { from: client, })
				})

				it('should NOT accept job offer for non-existent job worker', async () => {
					const payment = await contracts.jobController.calculateLockAmountFor.call(worker, jobId)
					assert.equal(
						(await contracts.jobController.acceptOffer.call(jobId, worker, { from: client, value: payment, })).toNumber(),
						ErrorsNamespace.JOB_CONTROLLER_WORKER_RATE_NOT_SET
					)
				})

				it('should THROW on `acceptOffer` if client sent insufficient funds', async () => {
					await contracts.jobController.postJobOffer(jobId, '0xfffffffffffffffffff', 1, 1, { from: worker, })
					const payment = await contracts.jobController.calculateLockAmountFor.call(worker, jobId)
					await asserts.throws(
						contracts.jobController.acceptOffer.call(jobId, worker, { from: client, value: payment.minus(1), })
					)
				})

				it('should THROW when trying to accept job offer if payment lock was not ' +
					'allowed in Payment Processor', async () => {
					await contracts.jobController.postJobOffer(jobId, '0x12f2a36ecd555', 1, '0x12f2a36ecd555', { from: worker, })
					await contracts.paymentProcessor.enableServiceMode()
					assert.isTrue(await contracts.paymentProcessor.serviceMode.call())
					const payment = await contracts.jobController.calculateLockAmountFor.call(worker, jobId)
					await asserts.throws(
						contracts.jobController.acceptOffer.call(jobId, worker, { from: client, value: payment, })
					)
				})
			})

			describe("and succeed when", () => {
				const jobId = 1

				it('should allow to accept job offer if payment lock was allowed by Payment Processor', async () => {
					await contracts.jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, jobDetailsIPFSHash, { from: client, })
					await contracts.jobController.postJobOffer(jobId, '0x12f2a36ecd555', 1, '0x12f2a36ecd555', { from: worker, })
					await contracts.paymentProcessor.enableServiceMode()
					await contracts.paymentProcessor.approve(jobId)
					const payment = await contracts.jobController.calculateLockAmountFor.call(worker, jobId)
					assert.equal(
						(await contracts.jobController.acceptOffer.call(jobId, worker, { from: client, value: payment, })).toNumber(),
						ErrorsNamespace.OK
					)
				})

				it('should lock correct amount of tokens on `acceptOffer`', async () => {
					const workerRate = 200000000000;
					const workerOnTop = 1000000000;
					const jobEstimate = 240;

					const estimatedLockAmount = Math.floor(
						((workerRate * (jobEstimate + 60) + workerOnTop) / 10) * 11
					);

					let clientBalanceBefore = await contracts.paymentGateway.getBalance(client)
					let workerBalanceBefore = await contracts.paymentGateway.getBalance(worker)

					await contracts.jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, jobDetailsIPFSHash, { from: client, })
					await contracts.jobController.postJobOffer(jobId, workerRate, jobEstimate, workerOnTop, { from: worker, })

					const payment = await contracts.jobController.calculateLockAmountFor.call(worker, jobId)
					await contracts.jobController.acceptOffer(jobId, worker, { from: client, value: payment, })

					assert.equal((await contracts.paymentGateway.getBalance(client)).toString(), '0')
					assert.equal((await contracts.paymentGateway.getBalance(jobId)).toString(), estimatedLockAmount.toString())
					assert.equal((await contracts.paymentGateway.getBalance(worker)).toString(), workerBalanceBefore.toString())
				})
			})
		})

		context("Job status and caller restrictions", () => {

			describe("workflow by", () => {
				const jobId = 1;
				const jobArea = 4;
				const jobCategory = 4;
				const jobSkills = 4;
				const jobDetails = jobDetailsIPFSHash;
				const additionalTime = 60;
				const workerRate = '0x12f2a36ecd555';
				const workerOnTop = '0x12f2a36ecd555';
				const jobEstimate = 180;

				before(async () => {
					await contracts.jobController.postJob(jobFlow, jobArea, jobCategory, jobSkills, jobDefaultPaySize, jobDetails, { from: client, })
					await contracts.jobController.postJobOffer(jobId, workerRate, jobEstimate, workerOnTop, { from: worker, })
				})

				after(async () => await reverter.revert())

				describe("accepting offer", () => {
					
					it("should NOT allow to accept offer by non-client with JOB_CONTROLLER_INVALID_ROLE code", async () => {
						const payment = await contracts.jobController.calculateLockAmountFor.call(worker, jobId)
						assert.equal(
							(await contracts.jobController.acceptOffer.call(jobId, worker, { from: stranger, value: payment, })).toNumber(),
							ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE
						)
					})
	
					it("should allow to accept offer by a client", async () => {
						const payment = await contracts.jobController.calculateLockAmountFor.call(worker, jobId)
						await contracts.jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
						assert.equal(await contracts.jobsDataProvider.getJobWorker.call(jobId), worker)
					})
	
					it("should allow to cancel a job by a client after an offer was accepted with OK code", async () => {
						assert.equal((await contracts.jobController.cancelJob.call(jobId, { from: client, })).toNumber(), ErrorsNamespace.OK)
					})
	
					it("should NOT allow to cancel a job by non-client after an offer was accepted with JOB_CONTROLLER_INVALID_ROLE code", async () => {
						assert.equal((await contracts.jobController.cancelJob.call(jobId, { from: stranger, })).toNumber(), ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE)
					})
				})
				
				describe("start work", () => {
					
					it("should NOT allow to start a job by non-worker with JOB_CONTROLLER_INVALID_ROLE code", async () => {
						assert.equal((await contracts.jobController.startWork.call(jobId, { from: stranger, })).toNumber(), ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE)
					})

					it("should allow to start a job by a worker with OK code", async () => {
						await contracts.jobController.startWork(jobId, { from: worker, })
						assert.equal((await contracts.jobsDataProvider.getJobState(jobId)).toNumber(), JobState.PENDING_START)
					})
	
					it("should allow to cancel a job by a client after a job was started with OK code", async () => {
						assert.equal((await contracts.jobController.cancelJob.call(jobId, { from: client, })).toNumber(), ErrorsNamespace.OK)
					})
	
					it("should NOT allow to cancel a job by non-client after a job was started with JOB_CONTROLLER_INVALID_ROLE code", async () => {
						assert.equal((await contracts.jobController.cancelJob.call(jobId, { from: stranger, })).toNumber(), ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE)
					})
	
					it("should NOT allow to confirm that a job was started by non-client with JOB_CONTROLLER_INVALID_ROLE code", async () => {
						assert.equal((await contracts.jobController.confirmStartWork.call(jobId, { from: stranger, })), ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE)
					})
	
					it("should allow to confirm that a job was started by client with OK code", async () => {
						assert.equal((await contracts.jobController.confirmStartWork.call(jobId, { from: client, })), ErrorsNamespace.OK)
					})
	
					it("should NOT allow to pause work by non-worker with JOB_CONTROLLER_INVALID_ROLE code", async () => {
						assert.equal((await contracts.jobController.pauseWork.call(jobId, { from: stranger, })), ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE)
					})
	
					it("should allow to pause work by worker", async () => {
						const tx = await contracts.jobController.pauseWork(jobId, { from: worker, })
						assert.equal(eventsHelper.extractEvents(tx, "WorkPaused").length, 1)
					})
	
					it("should NOT allow to resume work by non-worker with JOB_CONTROLLER_INVALID_ROLE code", async () => {
						assert.equal((await contracts.jobController.resumeWork.call(jobId, { from: stranger, })), ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE)
					})
	
					it("should allow to resume work by a worker", async () => {
						const tx = await contracts.jobController.resumeWork(jobId, { from: worker, })
						assert.equal(eventsHelper.extractEvents(tx, "WorkResumed").length, 1)
					})
				})

				describe("requesting additional time", () => {

					it("should NOT allow to submit additional time request by a client with JOB_CONTROLLER_INVALID_ROLE code", async () => {
						assert.equal(
							(await contracts.jobController.submitAdditionalTimeRequest.call(jobId, additionalTime, { from: client, })).toString(16),
							ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE.toString(16)
						)
					})
	
					it("should NOT allow to accept time request by a client without submitting it before by a worker with JOB_CONTROLLER_NO_TIME_REQUEST_SUBMITTED code", async () => {
						assert.equal(
							(await contracts.jobController.acceptAdditionalTimeRequest.call(jobId, additionalTime, { from: client, })).toString(16),
							ErrorsNamespace.JOB_CONTROLLER_NO_TIME_REQUEST_SUBMITTED.toString(16)
						)
					})
	
					it("should NOT allow to reject time request by a client without submitting it before by a worker with JOB_CONTROLLER_NO_TIME_REQUEST_SUBMITTED code", async () => {
						assert.equal(
							(await contracts.jobController.rejectAdditionalTimeRequest.call(jobId, { from: client, })).toString(16),
							ErrorsNamespace.JOB_CONTROLLER_NO_TIME_REQUEST_SUBMITTED.toString(16)
						)
					})
	
					it("should NOT allow to submit additional time request by a stranger with JOB_CONTROLLER_INVALID_ROLE code", async () => {
						assert.equal(
							(await contracts.jobController.submitAdditionalTimeRequest.call(jobId, additionalTime, { from: stranger, })).toString(16),
							ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE.toString(16)
						)
					})
	
					it("should allow to submit additional time request by a worker", async () => {
						const tx = await contracts.jobController.submitAdditionalTimeRequest(jobId, additionalTime, {  from: worker, })
						assert.equal(eventsHelper.extractEvents(tx, "TimeRequestSubmitted").length, 1)
					})
	
					it("should NOT allow to accept additional time request by a worker with JOB_CONTROLLER_INVALID_ROLE code", async () => {
						const additionalPayment = await contracts.jobController.calculateLock.call(worker, jobId, additionalTime, 0)
						assert.equal(
							(await contracts.jobController.acceptAdditionalTimeRequest.call(jobId, additionalTime, { from: worker, value: additionalPayment, })).toString(16),
							ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE.toString(16)
						)
					})
	
					it("should NOT allow to reject additional time request by a worker with JOB_CONTROLLER_INVALID_ROLE code", async () => {
						assert.equal(
							(await contracts.jobController.rejectAdditionalTimeRequest.call(jobId, { from: worker, })).toString(16),
							ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE.toString(16)
						)
					})
					
					it("should NOT allow to accept additional time request by a client with invalid additional time value with JOB_CONTROLLER_INCORRECT_TIME_PROVIDED code", async () => {
						const additionalPayment = await contracts.jobController.calculateLock.call(worker, jobId, additionalTime, 0)
						assert.equal(
							(await contracts.jobController.acceptAdditionalTimeRequest.call(jobId, additionalTime + 1, { from: client, value: additionalPayment, })).toString(16),
							ErrorsNamespace.JOB_CONTROLLER_INCORRECT_TIME_PROVIDED.toString(16)
						)
					})
					
					it("should THROW and NOT allow to accept additional time request by a client with invalid payment value with JOB_CONTROLLER_INVALID_ROLE code", async () => {
						const additionalPayment = await contracts.jobController.calculateLock.call(worker, jobId, additionalTime, 0)
						await asserts.throws(
							contracts.jobController.acceptAdditionalTimeRequest.call(jobId, additionalTime, { from: client, value: additionalPayment.sub(1), })
						)
					})
	
					it("should allow to add more time by a client", async () => {
						const additionalPayment = await contracts.jobController.calculateLock.call(worker, jobId, additionalTime, 0)
						const tx = await contracts.jobController.acceptAdditionalTimeRequest(jobId, additionalTime, { from: client, value: additionalPayment, })
						assert.equal(eventsHelper.extractEvents(tx, "TimeRequestAccepted").length, 1)
					})
	
					it("should NOT allow to accept additional time request by a client twice with JOB_CONTROLLER_NO_TIME_REQUEST_SUBMITTED code", async () => {
						const additionalPayment = await contracts.jobController.calculateLock.call(worker, jobId, additionalTime, 0)
						assert.equal(
							(await contracts.jobController.acceptAdditionalTimeRequest.call(jobId, additionalTime, { from: client, value: additionalPayment, })).toString(16),
							ErrorsNamespace.JOB_CONTROLLER_NO_TIME_REQUEST_SUBMITTED.toString(16)
						)
					})
	
					it("should NOT allow to reject additional time request by a client after acceptance with JOB_CONTROLLER_NO_TIME_REQUEST_SUBMITTED code", async () => {
						assert.equal(
							(await contracts.jobController.rejectAdditionalTimeRequest.call(jobId, { from: client, })).toString(16),
							ErrorsNamespace.JOB_CONTROLLER_NO_TIME_REQUEST_SUBMITTED.toString(16)
						)
					})
				})

				describe("end work", () => {
					
					it("should NOT allow to end work by non-worker with JOB_CONTROLLER_INVALID_ROLE code", async () => {
						assert.equal((await contracts.jobController.endWork.call(jobId, { from: stranger, })).toNumber(), ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE)
					})
	
					it("should allow to end work by a worker", async () => {
						await contracts.jobController.endWork(jobId, { from: worker, })
						assert.equal((await contracts.jobsDataProvider.getJobState(jobId)).toNumber(), JobState.PENDING_FINISH)
					})
	
					it("should NOT be able to cancel job by non-client when work is done with JOB_CONTROLLER_INVALID_ROLE code", async () => {
						assert.equal((await contracts.jobController.cancelJob.call(jobId, { from: stranger, })).toNumber(), ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE)
					})
	
					it("should NOT be able to cancel job by a client when work is done with JOB_CONTROLLER_INVALID_STATE code", async () => {
						assert.equal((await contracts.jobController.cancelJob.call(jobId, { from: client, })).toNumber(), ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE)
					})
	
					it("should NOT be able to confirm work was ended by non-client with JOB_CONTROLLER_INVALID_ROLE code", async () => {
						assert.equal((await contracts.jobController.confirmEndWork.call(jobId, { from: stranger, })).toNumber(), ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE)
					})
	
					it("should be able to confirm work was ended by a client with OK code", async () => {
						assert.equal((await contracts.jobController.confirmEndWork.call(jobId, { from: client, })).toNumber(), ErrorsNamespace.OK)
					})
	
					it("should be able to release payment after job is done", async () => {
						await contracts.jobController.releasePayment(jobId)
						assert.equal((await contracts.jobsDataProvider.getJobState.call(jobId)).toNumber(), JobState.FINALIZED)
					})
				})
			})

			describe("workflow transitions", () => {
				const jobId = 1

				afterEach(async () => await reverter.revert())

				it('should allow anyone to post an offer for a job only when a job has CREATED status', async () => {
					const operation = contracts.jobController.postJobOffer;
					const args = [jobId, '0x12F2A36ECD555', 180, '0x12F2A36ECD555', { from: worker, }];
					const results = {
						CREATED: ErrorsNamespace.OK,
						OFFER_ACCEPTED: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE,
					};

					await tmWithoutConfirmationOperationAllowance(operation, args, results)
				});

				it('should allow assigned worker to request work start only when a job has OFFER_ACCEPTED status', async () => {
					const operation = contracts.jobController.startWork;
					const args = [jobId, { from: worker, }];
					const results = {
						CREATED: ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE,
						OFFER_ACCEPTED: ErrorsNamespace.OK,
						PENDING_START: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE,
					};

					await tmWithoutConfirmationOperationAllowance(operation, args, results)
				});

				it('should allow client to confirm start work only when job has PENDING_START status', async () => {
					const operation = contracts.jobController.confirmStartWork;
					const args = [jobId, { from: client, }];
					const results = {
						PENDING_START: ErrorsNamespace.OK,
						STARTED: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE
					};

					await tmWithoutConfirmationOperationAllowance(operation, args, results)
				});

				it('should allow assigned worker to request end work only when job has PENDING_START status', async () => {
					const operation = contracts.jobController.endWork;
					const args = [jobId, { from: worker, }];
					const results = {
						CREATED: ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE,
						OFFER_ACCEPTED: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE,
						PENDING_START: ErrorsNamespace.OK,
						STARTED: ErrorsNamespace.OK,
					};

					await tmWithoutConfirmationOperationAllowance(operation, args, results)
				});

				it('should allow client to confirm end work only when job has PENDING_FINISH status', async () => {
					const operation = contracts.jobController.confirmEndWork;
					const args = [jobId, { from: client, }];
					const results = {
						PENDING_FINISH: ErrorsNamespace.OK,
					};

					await tmWithoutConfirmationOperationAllowance(operation, args, results)
				});

				it('should allow anyone to release payment only when job has PENDING_FINISH status', async () => {
					const operation = contracts.jobController.releasePayment;
					const args = [jobId, { from: accounts[3], }];
					const results = {
						PENDING_FINISH: ErrorsNamespace.OK,
					};

					await tmWithoutConfirmationOperationAllowance(operation, args, results)
				});

				it('should allow client to cancel job only at OFFER_ACCEPTED, PENDING_START, and STARTED states', async () => {
					const operation = contracts.jobController.cancelJob;
					const args = [jobId, { from: client, }];
					const results = {
						OFFER_ACCEPTED: ErrorsNamespace.OK,
						PENDING_START: ErrorsNamespace.OK,
						STARTED: ErrorsNamespace.OK,
						PENDING_FINISH: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE,
					};

					await tmWithoutConfirmationOperationAllowance(operation, args, results)
				});
			})

			describe("workflow on finishing", () => {
				const jobId = 1;
				const jobArea = 4;
				const jobCategory = 4;
				const jobSkills = 4;
				const jobDetails = jobDetailsIPFSHash;

				const workerRate = '0x12f2a36ecd555';
				const workerOnTop = '0x12f2a36ecd555';
				const jobEstimate = 180;

				beforeEach(async () => {
					await contracts.jobController.postJob(jobFlow, jobArea, jobCategory, jobSkills, jobDefaultPaySize, jobDetails, { from: client, })
					await contracts.jobController.postJobOffer(jobId, workerRate, jobEstimate, workerOnTop, { from: worker, })
					const payment = await contracts.jobController.calculateLockAmountFor.call(worker, jobId)
          			await contracts.jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
					await contracts.jobController.startWork(jobId, { from: worker, })
					await contracts.jobController.confirmStartWork(jobId, { from: client, })
					await contracts.jobController.endWork(jobId, { from: worker, })
				})

				afterEach(async () => await reverter.revert())

				it("should NOT be able able to cancel after worker had ended his work with JOB_CONTROLLER_INVALID_STATE code", async () => {
					assert.equal((await contracts.jobsDataProvider.getJobState.call(jobId)).toNumber(), JobState.PENDING_FINISH)
					assert.equal(
						(await contracts.jobController.cancelJob.call(jobId, { from: client, })).toNumber(),
						ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE
					)
				})

				it("should NOT be able able to cancel after client had confirmed that job is ended with JOB_CONTROLLER_INVALID_STATE code", async () => {
					await contracts.jobController.confirmEndWork(jobId, { from: client, })
					assert.equal((await contracts.jobsDataProvider.getJobState.call(jobId)).toNumber(), JobState.FINISHED)
					assert.equal(
						(await contracts.jobController.cancelJob.call(jobId, { from: client, })).toNumber(),
						ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE
					)
				})

				it("should be able to release payment after work was ended by a worker", async () => {
					await contracts.jobController.releasePayment(jobId)
					assert.equal((await contracts.jobsDataProvider.getJobState.call(jobId)).toNumber(), JobState.FINALIZED)
				})

				it("should be able to release payment after client had confirmed that job is ended", async () => {
					await contracts.jobController.confirmEndWork(jobId, { from: client, })
					await contracts.jobController.releasePayment(jobId)
					assert.equal((await contracts.jobsDataProvider.getJobState.call(jobId)).toNumber(), JobState.FINALIZED)
				})
			})
		})

		context('Time adjustments', () => {
			const jobId = 1
			const workerRate = '0x12f2a36ecd555';
			const workerOnTop = '0x12f2a36ecd555';
			const jobEstimate = 180;
			const additionalTime = 60

			beforeEach(async () => {
				await contracts.jobController.postJob(jobFlow, 4, 4, 7, jobDefaultPaySize, jobDetailsIPFSHash, { from: client, })
				await contracts.jobController.postJobOffer(jobId, workerRate, jobEstimate, workerOnTop, { from: worker, })
				const payment = await contracts.jobController.calculateLockAmountFor.call(worker, jobId)
				await contracts.jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
				await contracts.jobController.startWork(jobId, { from: worker, })
			})

			afterEach(async () => await reverter.revert())

			it("should NOT allow to pause work if it's already paused", async () => {
				const tx = await contracts.jobController.pauseWork(jobId, { from: worker, })
				assert.equal(eventsHelper.extractEvents(tx, "WorkPaused").length, 1)
				assert.equal(
					(await contracts.jobController.pauseWork.call(jobId, { from: worker, })).toNumber(),
					ErrorsNamespace.JOB_CONTROLLER_WORK_IS_ALREADY_PAUSED
				)
			})

			it("should NOT allow to resume work if it isn't paused", async () => {
				assert.equal(
					(await contracts.jobController.resumeWork.call(jobId, {from: worker})).toNumber(),
					ErrorsNamespace.JOB_CONTROLLER_WORK_IS_NOT_PAUSED
				)
			})


			it("should THROW and NOT allow to submit null amount of work time", async () => {
				await asserts.throws(
					contracts.jobController.submitAdditionalTimeRequest.call(jobId, 0, { from: worker, })
				)
			})

			it("should success when trying to submit more time if operation " +
				"is not allowed by Payment Processor", async () => {
				await contracts.paymentProcessor.enableServiceMode()
				assert.isTrue(await contracts.paymentProcessor.serviceMode.call())

				assert.equal(
					(await contracts.jobController.submitAdditionalTimeRequest.call(jobId, additionalTime, { from: worker, })).toString(16),
					ErrorsNamespace.OK.toString(16)
				)
			})

			it("should NOT success when trying to accept submitted time request if operation " +
				"is not allowed by Payment Processor", async () => {
				await contracts.paymentProcessor.enableServiceMode()
				assert.isTrue(await contracts.paymentProcessor.serviceMode.call())

				await contracts.jobController.submitAdditionalTimeRequest(jobId, additionalTime, { from: worker, })

				const additionalPayment = await contracts.jobController.calculateLock.call(worker, jobId, additionalTime, 0)
				await asserts.throws(
					contracts.jobController.acceptAdditionalTimeRequest.call(jobId, additionalTime, { from: client, value: additionalPayment, })
				)
			})

			it("should success when trying to reject submitted time request if operation " +
				"is not allowed by Payment Processor", async () => {
				await contracts.paymentProcessor.enableServiceMode()
				assert.isTrue(await contracts.paymentProcessor.serviceMode.call())

				await contracts.jobController.submitAdditionalTimeRequest(jobId, additionalTime, { from: worker, })
				assert.equal(
					(await contracts.jobController.rejectAdditionalTimeRequest.call(jobId, { from: client, })).toString(16),
					ErrorsNamespace.OK.toString(16)
				)
			})
		})

		context('Events', () => {
			const eventsTester = new EventTester({
				jobFlow: jobFlow,
				jobId: '1',
				skillsArea: '4',
				skillsCategory: '4',
				skills: '555',
				workerRate: '0x12f2a36ecd555',
				workerOnTop: '0x12f2a36ecd555',
				jobEstimate: 180,
			})

			context ("workflow with completed job", () => {

				describe("with no confirmations", () => {
					after(async () => await reverter.revert())

					eventsTester._testJobPosted()
					eventsTester._testTMJobOfferPosted()
					eventsTester._testJobOfferAccepted()
					eventsTester._testStartWorking()
					eventsTester._testWorkPaused()
					eventsTester._testWorkResumed()
					eventsTester._testSubmitTimeRequest()
					eventsTester._testAcceptTimeRequest()
					eventsTester._testEndWorking()
					eventsTester._testReleasePayment()
				})

				describe("with only start work confirmation", () => {
					after(async () => await reverter.revert())

					eventsTester._testJobPosted()
					eventsTester._testTMJobOfferPosted()
					eventsTester._testJobOfferAccepted()
					eventsTester._testStartWorking()
					eventsTester._testConfirmStartWork()
					eventsTester._testWorkPaused()
					eventsTester._testWorkResumed()
					eventsTester._testSubmitTimeRequest()
					eventsTester._testAcceptTimeRequest()
					eventsTester._testEndWorking()
					eventsTester._testReleasePayment()
				})

				describe("with only end work confirmation", () => {
					after(async () => await reverter.revert())

					eventsTester._testJobPosted()
					eventsTester._testTMJobOfferPosted()
					eventsTester._testJobOfferAccepted()
					eventsTester._testStartWorking()
					eventsTester._testWorkPaused()
					eventsTester._testWorkResumed()
					eventsTester._testSubmitTimeRequest()
					eventsTester._testRejectTimeRequest()
					eventsTester._testEndWorking()
					eventsTester._testConfirmEndWork()
					eventsTester._testReleasePayment()
				})

				describe("with start and end work confirmations", () => {
					after(async () => await reverter.revert())

					eventsTester._testJobPosted()
					eventsTester._testTMJobOfferPosted()
					eventsTester._testJobOfferAccepted()
					eventsTester._testStartWorking()
					eventsTester._testConfirmStartWork()
					eventsTester._testWorkPaused()
					eventsTester._testWorkResumed()
					eventsTester._testSubmitTimeRequest()
					eventsTester._testRejectTimeRequest()
					eventsTester._testEndWorking()
					eventsTester._testConfirmEndWork()
					eventsTester._testReleasePayment()
				})
			})

			context("workflow with cancelled job", () => {

				describe("when cancelled without start confirmation", () => {
					after(async () => await reverter.revert())

					eventsTester._testJobPosted()
					eventsTester._testTMJobOfferPosted()
					eventsTester._testJobOfferAccepted()
					eventsTester._testStartWorking()
					eventsTester._testJobCancelled()
				})
			})
		})

		context('Reward release', () => {
			const jobId = 1;
			const workerRate = 200000000000;
			const workerOnTop = 1000000000;
			const jobEstimate = 240;
			var payment

			const jobParams = {
				jobId: jobId,
				workerRate: workerRate,
				workerOnTop: workerOnTop,
				jobEstimate: jobEstimate,
			}

			var clientBalanceBefore
			var workerBalanceBefore

			describe("when cancelling job should use payment processor and", () => {
				before(async () => {
					
					await contracts.jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, jobDetailsIPFSHash, { from: client, })
					await contracts.jobController.postJobOffer(jobId, workerRate, jobEstimate, workerOnTop, { from: worker, })
					
					payment = await contracts.jobController.calculateLockAmountFor.call(worker, jobId)
					await contracts.jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
				})

				after(async () => await reverter.revert())

				it("should NOT allow to cancel job if operation was not allowed by Payment Processor", async () => {
					await contracts.paymentProcessor.enableServiceMode()
					assert.isTrue(await contracts.paymentProcessor.serviceMode())

					assert.equal(
						(await contracts.jobController.cancelJob.call(jobId, { from: client, })).toNumber(),
						ErrorsNamespace.PAYMENT_PROCESSOR_OPERATION_IS_NOT_APPROVED
					)
				})

				it("should allow to cancel job if operation was allowed by Payment Processor", async () => {
					await contracts.paymentProcessor.approve(jobId)
					assert.equal(
						(await contracts.jobController.cancelJob.call(jobId, { from: client, })),
						ErrorsNamespace.OK
					)
				})

				it('should release just jobOfferOnTop on `cancelJob` on OFFER_ACCEPTED job stage', async () => {
					workerBalanceBefore = await helpers.getEthBalance(worker)
					clientBalanceBefore = await helpers.getEthBalance(client)

					const tx = await contracts.jobController.cancelJob(jobId, { from: client, })
					clientBalanceBefore = clientBalanceBefore.sub(await helpers.getTxExpences(tx.tx))

					assert.equal(
						(await helpers.getEthBalance(client)).toString(16),
						clientBalanceBefore.plus(payment.minus(workerOnTop)).toString(16)
					)
					assert.equal(
						(await helpers.getEthBalance(worker)).toString(16),
						workerBalanceBefore.plus(workerOnTop).toString(16)
					)
					assert.equal(
						(await contracts.paymentGateway.getBalance(jobId)).toString(16),
						'0'
					)
				})
			})

			describe("when releasing payment", () => {
				var payment

				beforeEach(async () => {
					await contracts.jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, jobDetailsIPFSHash, { from: client, })
					await contracts.jobController.postJobOffer(jobId, workerRate, jobEstimate, workerOnTop, { from: worker, })

					payment = await contracts.jobController.calculateLockAmountFor.call(worker, jobId)
					await contracts.jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
				})

				afterEach(async () => await reverter.revert())

				it("should NOT allow to release payment when operation was not allowed by Payment Processor", async () => {
					await contracts.jobController.startWork(jobId, { from: worker, })
					await contracts.jobController.endWork(jobId, { from: worker, })

					await contracts.paymentProcessor.enableServiceMode()
					assert.isTrue(await contracts.paymentProcessor.serviceMode())
					assert.equal(
						(await contracts.jobController.releasePayment.call(jobId)).toNumber(),
						ErrorsNamespace.PAYMENT_PROCESSOR_OPERATION_IS_NOT_APPROVED
					)
				})

				it("should allow to release payment when operation was allowed by Payment Processor", async () => {
					await contracts.jobController.startWork(jobId, { from: worker, })
					await contracts.jobController.endWork(jobId, { from: worker, })

					await contracts.paymentProcessor.enableServiceMode()
					assert.isTrue(await contracts.paymentProcessor.serviceMode())

					await contracts.paymentProcessor.approve(jobId)
					assert.equal(
						(await contracts.jobController.releasePayment.call(jobId)).toNumber(),
						ErrorsNamespace.OK
					)
				})

				describe("on `cancelJob` at PENDING_STARTED job stage", () => {
					const jobPaymentEstimate = workerRate * 60 + workerOnTop;

					beforeEach(async () => {
						await contracts.jobController.startWork(jobId, { from: worker, })

						workerBalanceBefore = await helpers.getEthBalance(worker)
						clientBalanceBefore = await helpers.getEthBalance(client)
						
						const tx = await contracts.jobController.cancelJob(jobId, {from: client})
						
						clientBalanceBefore = clientBalanceBefore.sub(await helpers.getTxExpences(tx.tx))
					})

					it('should release jobOfferOnTop + 1 hour of work on ', async () => {
						assert.equal(
							(await helpers.getEthBalance(client)).toString(16),
							clientBalanceBefore.plus(payment.minus(jobPaymentEstimate)).toString(16)
						)
						assert.equal(
							(await helpers.getEthBalance(worker)).toString(16),
							workerBalanceBefore.add(jobPaymentEstimate).toString(16)
						)
						assert.equal(
							(await contracts.paymentGateway.getBalance(jobId)).toString(16),
							'0'
						)
					})
				})

				describe("on `cancelJob` at STARTED job stage'", () => {
					const jobPaymentEstimate = workerRate * 60 + workerOnTop;

					beforeEach(async () => {
						await contracts.jobController.startWork(jobId, { from: worker, })
						await contracts.jobController.confirmStartWork(jobId, { from: client, })
						
						workerBalanceBefore = await helpers.getEthBalance(worker)
						clientBalanceBefore = await helpers.getEthBalance(client)
						
						const tx = await contracts.jobController.cancelJob(jobId, {from: client})
						
						clientBalanceBefore = clientBalanceBefore.sub(await helpers.getTxExpences(tx.tx))
					})

					it('should release jobOfferOnTop + 1 hour of work', async () => {
						assert.equal(
							(await helpers.getEthBalance(client)).toString(16),
							clientBalanceBefore.plus(payment.minus(jobPaymentEstimate)).toString(16)
						)
						assert.equal(
							(await helpers.getEthBalance(worker)).toString(16),
							workerBalanceBefore.add(jobPaymentEstimate).toString(16)
						)
						assert.equal(
							(await contracts.paymentGateway.getBalance(jobId)).toString(16),
							'0'
						)
					})
				})
			})

			describe('when releasing payment after work is done', () => {

				const jobPaymentEstimate = (timeSpent) => jobParams.workerRate * timeSpent + jobParams.workerOnTop;

				afterEach(async () => await reverter.revert())

				it('should release correct amount of tokens on `releasePayment` when worked for exactly the estimated time', async () => {
					const timeSpent = jobParams.jobEstimate;
					await tm_onReleasePayment(jobParams, timeSpent, jobPaymentEstimate(timeSpent))
				});

				it('should release correct amount of tokens on `releasePayment` when ' +
					'worked for more than an hour but less than estimated time', async () => {
					const timeSpent = 183;
					await tm_onReleasePayment(jobParams, timeSpent, jobPaymentEstimate(timeSpent))
				});

				  it('should release correct amount of tokens on `releasePayment` when ' +
					 'worked for more than estimated time but less than estimated time and an hour', async () => {
					const timeSpent = 299;
					await tm_onReleasePayment(jobParams, timeSpent, jobPaymentEstimate(timeSpent))
				  });

				  it('should release possible maximum of tokens(estimate + 1 hour) ' +
					 'when worked for more than estimate and an hour', async () => {
					const timeSpent = 340;
					await tm_onReleasePayment(jobParams, timeSpent, jobPaymentEstimate(jobParams.jobEstimate + 60))
				  });

				  it('should release minimum an hour of work on `releasePayment` when worked for less than an hour', async () => {
					const timeSpent = 17;
					await tm_onReleasePayment(jobParams, timeSpent, jobPaymentEstimate(60))
				  });


				  it('should release correct amount of tokens on `releasePayment` ' +
					 'when worked for exactly the estimated time, with pauses/resumes', async () => {
					const timeSpent = 183;
					await tm_onReleasePayment(jobParams, timeSpent, jobPaymentEstimate(timeSpent), true)
				  });

				  it('should release correct amount of tokens on `releasePayment` when ' +
					 'worked for more than an hour but less than estimated time, with pauses/resumes', async () => {
					const timeSpent = 183;
					await tm_onReleasePayment(jobParams, timeSpent, jobPaymentEstimate(timeSpent), true)
				  });

				  it('should release correct amount of tokens on `releasePayment` when ' +
					 'worked for more than estimated time but less than estimated time and an hour, with pauses/resumes', async () => {
					const timeSpent = 299;
					await tm_onReleasePayment(jobParams, timeSpent, jobPaymentEstimate(timeSpent), true)
				  });

				  it('should release possible maximum of tokens(estimate + 1 hour) ' +
					 'when worked for more than estimate and an hour, with pauses/resumes', async () => {
					const timeSpent = 340;
					await tm_onReleasePayment(jobParams, timeSpent, jobPaymentEstimate(jobParams.jobEstimate + 60))
				  });

				  it('should release minimum an hour of work on `releasePayment` ' +
					 'when worked for less than an hour, with pauses/resumes', async () => {
					const timeSpent = 17;
					await tm_onReleasePayment(jobParams, timeSpent, jobPaymentEstimate(60))
				  });
			})
		})
	})

	context("Fixed priced", () => {
		const jobFlow = Workflow.FIXED_PRICE

		context("Job posting", () => {
			afterEach(async () => await reverter.revert())

			it('should allow anyone to post a job', async () => {
				for (const account of accounts) {
					assert.equal(
						(await contracts.jobController.postJob.call(jobFlow, 4, 4, 4, jobDefaultPaySize, jobDetailsIPFSHash, { from: account, })).toNumber(),
						ErrorsNamespace.OK
					)
				}
			})

			it('should allow to post a job several times by different users', async () => {
				const clients = accounts.slice(1, 4)
				const area = 1
				const category = 4
				const skills = 2
				const args = [ jobFlow, area, category, skills, jobDefaultPaySize, jobDetailsIPFSHash, ]

				for (const c of clients) {
					const tx = await contracts.jobController.postJob(...args, { from: c, })
					helpers.assertLogs([{
						event: "JobPosted",
						args: {
						  client: c,
						},
					}])(tx)
				}
				asserts.equal(clients.length)(await contracts.jobsDataProvider.getJobsCount())
			})

		})

		context("Post job offer", () => {
			const jobId = 1;

			before(async () => {
				await contracts.jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, jobDetailsIPFSHash, { from: client, })
			})

			after(async () => await reverter.revert())

			it('should NOT allow to post a TM job offer for a Fixed Price job', async () => {
				const rate = '0x1D1745D1745D1745D1745D1745D1745D1745D1745D1745D1745D1745D1745D1';
				const estimate = 68;
				const ontop = 59;
				/**
				 * With these values,  ((rate * (estimate + 60) + ontop) / 10) * 11  will equal near the uint256 value
				 */
				assert.equal(
					(await contracts.jobController.postJobOffer.call(jobId, rate, estimate, ontop, { from: worker, })).toNumber(),
					ErrorsNamespace.JOB_CONTROLLER_INVALID_WORKFLOW_TYPE
				)
			})

			it('should THROW and do NOT allow to post a job offer with null price', async () => {
				await asserts.throws(
					contracts.jobController.postJobOfferWithPrice.call(jobId, 0, { from: worker, })
				)
			})

			it("should allow to post a job offer", async () => {
				assert.equal(
					(await contracts.jobController.postJobOfferWithPrice.call(jobId, '0xfffffffffffffffffff', { from: worker, })).toNumber(),
					ErrorsNamespace.OK
				)
			});

			it('should NOT allow to post a job offer by a client', async () => {
				assert.equal(
					(await contracts.jobController.postJobOfferWithPrice.call(jobId, '0xfffffffffffffffffff', { from: client, })).toNumber(),
					ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE
				)
			})
		})

		context("Accept job offer", () => {

			describe("and fail when", () => {
				const jobId = 1;

				beforeEach(async () => {
					await contracts.jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, jobDetailsIPFSHash, { from: client, })
				})

				afterEach(async () => await reverter.revert())

				it('should NOT accept job offer for non-existent job worker', async () => {
					const payment = await contracts.jobController.calculateLockAmountFor.call(worker, jobId)
					assert.equal(
						(await contracts.jobController.acceptOffer.call(jobId, worker, { from: client, value: payment, })).toNumber(),
						ErrorsNamespace.JOB_CONTROLLER_WORKER_RATE_NOT_SET
					)
				})

				it('should THROW on `acceptOffer` if client sent insufficient funds', async () => {
					await contracts.jobController.postJobOfferWithPrice(jobId, '0xfffffffffffffffffff', { from: worker, })
					const payment = await contracts.jobController.calculateLockAmountFor.call(worker, jobId)
					await asserts.throws(
						contracts.jobController.acceptOffer.call(jobId, worker, { from: client, value: payment.minus(1), })
					)
				})

				it('should THROW when trying to accept job offer if payment lock was not allowed in Payment Processor', async () => {
					await contracts.jobController.postJobOfferWithPrice(jobId, '0x12f2a36ecd555', { from: worker, })
					await contracts.paymentProcessor.enableServiceMode()
					assert.isTrue(await contracts.paymentProcessor.serviceMode.call())
					const payment = await contracts.jobController.calculateLockAmountFor.call(worker, jobId)
					await asserts.throws(
						contracts.jobController.acceptOffer.call(jobId, worker, { from: client, value: payment, })
					)
				})
			})

			describe("and succeed when", () => {
				const jobId = 1

				afterEach(async () => await reverter.revert())

				it('should allow to accept job offer if payment lock was allowed by Payment Processor', async () => {
					await contracts.jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, jobDetailsIPFSHash, { from: client, })
					await contracts.jobController.postJobOfferWithPrice(jobId, '0x12f2a36ecd555', { from: worker, })
					await contracts.paymentProcessor.enableServiceMode()
					await contracts.paymentProcessor.approve(jobId)
					const payment = await contracts.jobController.calculateLockAmountFor.call(worker, jobId)
					assert.equal(
						(await contracts.jobController.acceptOffer.call(jobId, worker, { from: client, value: payment, })).toNumber(),
						ErrorsNamespace.OK
					)
				})

				it('should lock correct amount of tokens on `acceptOffer`', async () => {
					const price = 200000000000;

					let clientBalanceBefore = await contracts.paymentGateway.getBalance(client)
					let workerBalanceBefore = await contracts.paymentGateway.getBalance(worker)

					await contracts.jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, jobDetailsIPFSHash, { from: client, })
					await contracts.jobController.postJobOfferWithPrice(jobId, price, { from: worker, })

					const payment = await contracts.jobController.calculateLockAmountFor.call(worker, jobId)
					await contracts.jobController.acceptOffer(jobId, worker, { from: client, value: payment, })

					assert.equal((await contracts.paymentGateway.getBalance(client)).toString(), '0')
					assert.equal((await contracts.paymentGateway.getBalance(jobId)).toString(), price.toString())
					assert.equal((await contracts.paymentGateway.getBalance(worker)).toString(), workerBalanceBefore.toString())
				})
			})

		})

		context("Job status and caller restrictions", () => {
			describe("workflow by", () => {
				const jobId = 1;
				const jobArea = 4;
				const jobCategory = 4;
				const jobSkills = 4;
				const workerRate = '0x12f2a36ecd555';

				before(async () => {
					await contracts.jobController.postJob(jobFlow, jobArea, jobCategory, jobSkills, jobDefaultPaySize, jobDetailsIPFSHash, { from: client, })
					await contracts.jobController.postJobOfferWithPrice(jobId, workerRate, { from: worker, })
				})

				after(async () => await reverter.revert())

				it("should NOT allow to accept offer by non-client with JOB_CONTROLLER_INVALID_ROLE code", async () => {
					const payment = await contracts.jobController.calculateLockAmountFor.call(worker, jobId)
					assert.equal(
						(await contracts.jobController.acceptOffer.call(jobId, worker, { from: stranger, value: payment, })).toNumber(),
						ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE
					)
				})

				it("should NOT be able to cancel job by non-client when work is done with JOB_CONTROLLER_INVALID_WORKFLOW_TYPE code", async () => {
					assert.equal(
						(await contracts.jobController.cancelJob.call(jobId, { from: client, })).toNumber(),
						ErrorsNamespace.JOB_CONTROLLER_INVALID_WORKFLOW_TYPE
					)
				})

				it("should allow to accept offer by a client", async () => {
					const payment = await contracts.jobController.calculateLockAmountFor.call(worker, jobId)
					await contracts.jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
					assert.equal(await contracts.jobsDataProvider.getJobWorker.call(jobId), worker)
				})

				it("should NOT allow to start a job by non-worker with JOB_CONTROLLER_INVALID_ROLE code", async () => {
					assert.equal(
						(await contracts.jobController.startWork.call(jobId, { from: stranger, })).toNumber(),
						ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE
					)
				})

				it("should allow to start a job by a worker with OK code", async () => {
					await contracts.jobController.startWork(jobId, { from: worker, })
					assert.equal((await contracts.jobsDataProvider.getJobState(jobId)).toNumber(), JobState.PENDING_START)
				})

				it("should NOT be able to cancel job by anyone right after the start with JOB_CONTROLLER_INVALID_WORKFLOW_TYPE code", async () => {
					assert.equal(
						(await contracts.jobController.cancelJob.call(jobId, { from: client, })).toNumber(),
						ErrorsNamespace.JOB_CONTROLLER_INVALID_WORKFLOW_TYPE
					)
				})

				it("should NOT allow to confirm that a job was started by anyone with JOB_CONTROLLER_INVALID_WORKFLOW_TYPE code", async () => {
					assert.equal(
						(await contracts.jobController.confirmStartWork.call(jobId, { from: client, })).toNumber(),
						ErrorsNamespace.JOB_CONTROLLER_INVALID_WORKFLOW_TYPE
					)
				})

				it("should NOT allow to pause work by non-worker with JOB_CONTROLLER_INVALID_ROLE code", async () => {
					assert.equal(
						(await contracts.jobController.pauseWork.call(jobId, { from: stranger, })),
						ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE
					)
				})

				it("should allow to pause work by worker", async () => {
					const tx = await contracts.jobController.pauseWork(jobId, { from: worker, })
					assert.equal(eventsHelper.extractEvents(tx, "WorkPaused").length, 1)
				})

				it("should NOT allow to resume work by non-worker with JOB_CONTROLLER_INVALID_ROLE code", async () => {
					assert.equal(
						(await contracts.jobController.resumeWork.call(jobId, { from: stranger, })),
						ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE
					)
				})

				it("should allow to resume work by a worker", async () => {
					const tx = await contracts.jobController.resumeWork(jobId, { from: worker, })
					assert.equal(eventsHelper.extractEvents(tx, "WorkResumed").length, 1)
				})

				it("should NOT allow to submit more time request by a worker (and anyone) with JOB_CONTROLLER_INVALID_WORKFLOW_TYPE code", async () => {
					const additionalTime = 60
					assert.equal(
						(await contracts.jobController.submitAdditionalTimeRequest.call(jobId, additionalTime, { from: worker, })).toNumber(),
						ErrorsNamespace.JOB_CONTROLLER_INVALID_WORKFLOW_TYPE
					)
				})

				it("should NOT allow to accept more time request by a client (and anyone) with JOB_CONTROLLER_INVALID_WORKFLOW_TYPE code", async () => {
					const additionalTime = 60
					assert.equal(
						(await contracts.jobController.acceptAdditionalTimeRequest.call(jobId, additionalTime, { from: client, value: 0, })).toNumber(),
						ErrorsNamespace.JOB_CONTROLLER_INVALID_WORKFLOW_TYPE
					)
				})

				it("should NOT allow to reject more time request by a client (and anyone) with JOB_CONTROLLER_INVALID_WORKFLOW_TYPE code", async () => {
					assert.equal(
						(await contracts.jobController.rejectAdditionalTimeRequest.call(jobId, { from: client, })).toNumber(),
						ErrorsNamespace.JOB_CONTROLLER_INVALID_WORKFLOW_TYPE
					)
				})

				it("should NOT allow to submit more time by a client (and anyone)", async () => {
					const additionalTime = 60
					const tx = await contracts.jobController.submitAdditionalTimeRequest(jobId, additionalTime, {  from: worker, })
					assert.equal(eventsHelper.extractEvents(tx, "TimeRequestSubmitted").length, 0)
				})

				it("should NOT allow to accept work results in the middle of work process by a stranger with JOB_CONTROLLER_INVALID_ROLE code", async () => {
					assert.equal(
						(await contracts.jobController.acceptWorkResults.call(jobId, { from: stranger, })).toNumber(),
						ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE
					)
				})

				it("should NOT allow to accept work results in the middle of work process by a client with JOB_CONTROLLER_INVALID_STATE code", async () => {
					assert.equal(
						(await contracts.jobController.acceptWorkResults.call(jobId, { from: client, })).toNumber(),
						ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE
					)
				})

				it("should NOT allow to end work by non-worker with JOB_CONTROLLER_INVALID_ROLE code", async () => {
					assert.equal(
						(await contracts.jobController.endWork.call(jobId, { from: stranger, })).toNumber(),
						ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE
					)
				})

				it("should allow to end work by a worker", async () => {
					await contracts.jobController.endWork(jobId, { from: worker, })
					assert.equal((await contracts.jobsDataProvider.getJobState(jobId)).toNumber(), JobState.PENDING_FINISH)
				})

				it("should NOT be able to cancel job by non-client when work is done with JOB_CONTROLLER_INVALID_WORKFLOW_TYPE code", async () => {
					assert.equal(
						(await contracts.jobController.cancelJob.call(jobId, { from: client, })).toNumber(),
						ErrorsNamespace.JOB_CONTROLLER_INVALID_WORKFLOW_TYPE
					)
				})

				it("should NOT be able to confirm work was ended by anyone with JOB_CONTROLLER_INVALID_WORKFLOW_TYPE code", async () => {
					assert.equal(
						(await contracts.jobController.confirmEndWork.call(jobId, { from: client, })).toNumber(),
						ErrorsNamespace.JOB_CONTROLLER_INVALID_WORKFLOW_TYPE
					)
				})

				it("should NOT allow to release payment after work was finished", async () => {
					assert.equal(
						(await contracts.jobController.releasePayment.call(jobId)).toNumber(),
						ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE
					)
				})

				it("should NOT allow to accept work results by the worker with JOB_CONTROLLER_INVALID_ROLE code", async () => {
					assert.equal(
						(await contracts.jobController.acceptWorkResults.call(jobId, { from: worker, })).toNumber(),
						ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE
					)
				})

				it("should allow to accept work results by the worker with OK code", async () => {
					assert.equal(
						(await contracts.jobController.acceptWorkResults.call(jobId, { from: client, })).toNumber(),
						ErrorsNamespace.OK
					)
				})

				it("should NOT allow to reject work results by the worker JOB_CONTROLLER_INVALID_ROLE code", async () => {
					assert.equal(
						(await contracts.jobController.acceptWorkResults.call(jobId, { from: worker, })).toNumber(),
						ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE
					)
				})

				it("should allow to reject work results by the worker OK code", async () => {
					assert.equal(
						(await contracts.jobController.acceptWorkResults.call(jobId, { from: client, })).toNumber(),
						ErrorsNamespace.OK
					)
				})

				it("should allow to accept work results by the worker", async () => {
					const tx = await contracts.jobController.acceptWorkResults(jobId, { from: client, })
					assert.equal(eventsHelper.extractEvents(tx, "WorkAccepted").length, 1)
				})

				it("should be able to release payment after job is done", async () => {
					await contracts.jobController.releasePayment(jobId)
					assert.equal((await contracts.jobsDataProvider.getJobState.call(jobId)).toNumber(), JobState.FINALIZED)
				})
			})

			describe("workflow transitions", () => {
				const jobId = 1

				afterEach(async () => await reverter.revert())

				it('should allow anyone to post an offer for a job only when a job has CREATED status', async () => {
					const operation = contracts.jobController.postJobOfferWithPrice;
					const args = [jobId, '0x12F2A36ECD555', { from: worker, }];
					const results = {
						CREATED: ErrorsNamespace.OK,
						OFFER_ACCEPTED: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE,
					};

					await fixedPriceOperationAllowance(operation, args, results)
				});

				it('should allow assigned worker to request work start only when a job has OFFER_ACCEPTED status', async () => {
					const operation = contracts.jobController.startWork;
					const args = [jobId, { from: worker, }];
					const results = {
						CREATED: ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE, /// ???
						OFFER_ACCEPTED: ErrorsNamespace.OK,
						PENDING_START: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE,
					};

					await fixedPriceOperationAllowance(operation, args, results)
				});

				it('should allow assigned worker to request end work only when job has PENDING_START status', async () => {
					const operation = contracts.jobController.endWork;
					const args = [jobId, { from: worker, }];
					const results = {
						CREATED: ErrorsNamespace.JOB_CONTROLLER_INVALID_ROLE,
						OFFER_ACCEPTED: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE,
						PENDING_START: ErrorsNamespace.OK,
					};

					await fixedPriceOperationAllowance(operation, args, results)
				});

				it("should allow the client to decide to accept work results when work has PENDING_FINISH status ", async () => {
					const operation = contracts.jobController.acceptWorkResults;
					const args = [jobId, { from: client, }];
					const results = {
						PENDING_FINISH: ErrorsNamespace.OK,
					};

					await fixedPriceOperationAllowance(operation, args, results)
				})

				it("should allow the client to decide to reject work results when work has PENDING_FINISH status ", async () => {
					const operation = contracts.jobController.rejectWorkResults;
					const args = [jobId, { from: client, }];
					const results = {
						PENDING_FINISH: ErrorsNamespace.OK,
					};

					await fixedPriceOperationAllowance(operation, args, results, false)
				})

				it('should allow anyone to release payment only when job has WORK_ACCEPTED status', async () => {
					const operation = contracts.jobController.releasePayment;
					const args = [jobId, { from: accounts[3], }];
					const results = {
						WORK_ACCEPTED: ErrorsNamespace.OK,
					};

					await fixedPriceOperationAllowance(operation, args, results)
				});

				it("release payment is NOT allowed before resolving dispute when WORK_REJECTED status", async () => {
					const operation = contracts.jobController.releasePayment;
					const args = [jobId, { from: accounts[3], }];
					const results = {
						WORK_REJECTED: ErrorsNamespace.JOB_CONTROLLER_INVALID_STATE,
					};

					await fixedPriceOperationAllowance(operation, args, results, false)
				})
			})
		})

		describe('Events', () => {
			const eventsTester = new EventTester({
				jobFlow: jobFlow,
				jobId: '1',
				skillsArea: '4',
				skillsCategory: '4',
				skills: '555',
				workerRate: '0x12f2a36ecd555',
			})

			describe("with accepted job", () => {
				after(async () => await reverter.revert())

				eventsTester._testJobPosted()
				eventsTester._testFixedPriceJobOfferPosted()
				eventsTester._testJobOfferAccepted()
				eventsTester._testStartWorking()
				eventsTester._testEndWorking()
				eventsTester._testAcceptWorkResults()
				eventsTester._testReleasePayment()
			})

			describe("with rejected job", () => {
				after(async () => await reverter.revert())

				eventsTester._testJobPosted()
				eventsTester._testFixedPriceJobOfferPosted()
				eventsTester._testJobOfferAccepted()
				eventsTester._testStartWorking()
				eventsTester._testEndWorking()
				eventsTester._testRejectWorkResults()
				eventsTester._testResolveWorkDispute()
			})
		})

		describe('Reward release', () => {
			const jobId = '1'
			const workerRate = 200000000000;

			var payment
			var clientBalanceBefore
			var workerBalanceBefore

			const timeOps = async (jobId = '1', timeSpent = 4 * 24, pauses = false) => {
				if (pauses) {
					await helpers.increaseTime(timeSpent / 2 * 60)
					await helpers.mine()
					await contracts.jobController.pauseWork(jobId, { from: worker, })
					await helpers.increaseTime(30 * 60)
					await helpers.mine()
					await contracts.jobController.resumeWork(jobId, { from: worker, })
					await helpers.increaseTime(timeSpent / 2 * 60)
					await helpers.mine()
				} else {
					await helpers.increaseTime(timeSpent * 60)
					await helpers.mine()
				}
			}

			describe("when accepting work after finish", () => {

				before(async () => {
					await contracts.jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, jobDetailsIPFSHash, { from: client, })
					await contracts.jobController.postJobOfferWithPrice(jobId, workerRate, { from: worker, })
					payment = await contracts.jobController.calculateLockAmountFor.call(worker, jobId)
					await contracts.jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
					await contracts.jobController.startWork(jobId, { from: worker, })
					await timeOps()
					await contracts.jobController.endWork(jobId, { from: worker, })
					await contracts.jobController.acceptWorkResults(jobId, { from: client, })

					clientBalanceBefore = await helpers.getEthBalance(client)
					workerBalanceBefore = await helpers.getEthBalance(worker)
				})

				after(async () => await reverter.revert())

				it("should NOT allow to release fixed amount when it is not allowed by Payment Processor", async () => {
					await contracts.paymentProcessor.enableServiceMode()
					assert.isTrue(await contracts.paymentProcessor.serviceMode())
					assert.equal(
						(await contracts.jobController.releasePayment.call(jobId)).toNumber(),
						ErrorsNamespace.PAYMENT_PROCESSOR_OPERATION_IS_NOT_APPROVED
					)
				})

				it("should allow to release fixed amount when it is allowed by Payment Processor", async () => {
					await contracts.paymentProcessor.enableServiceMode()
					assert.isTrue(await contracts.paymentProcessor.serviceMode())

					await contracts.paymentProcessor.approve(jobId)
					assert.equal(
						(await contracts.jobController.releasePayment.call(jobId)).toNumber(),
						ErrorsNamespace.OK
					)
				})

				it("should release the fixed amount even after long period of time", async () => {
					await contracts.jobController.releasePayment(jobId)
					assert.equal(
						(await helpers.getEthBalance(client)).toString(16),
						clientBalanceBefore.toString(16)
					)
					assert.equal(
						(await helpers.getEthBalance(worker)).toString(16),
						workerBalanceBefore.plus(workerRate).toString(16)
					)
					assert.equal(
						(await contracts.paymentGateway.getBalance.call(jobId)).toString(16),
						'0'
					)
				})
			})

			describe("when rejecting work after finish", () => {

				before(async () => {
					await contracts.jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, jobDetailsIPFSHash, { from: client, })
					await contracts.jobController.postJobOfferWithPrice(jobId, workerRate, { from: worker, })
					payment = await contracts.jobController.calculateLockAmountFor.call(worker, jobId)
					await contracts.jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
					await contracts.jobController.startWork(jobId, { from: worker, })
					await timeOps()
					await contracts.jobController.endWork(jobId, { from: worker, })

					clientBalanceBefore = await helpers.getEthBalance(client)
					workerBalanceBefore = await helpers.getEthBalance(worker)
				})

				after(async () => await reverter.revert())

				it("should NOT release any balance to a worker nor a client when rejecting work results", async () => {
					await contracts.jobController.setPaymentProcessor(contracts.mock.address)
					await contracts.mock.expect(
						contracts.jobController.address,
						0,
						contracts.paymentProcessor.contract.releasePayment.getData(
							await contracts.mock.convertUIntToBytes32.call(jobId),
							worker,
							workerRate,
							client,
							workerRate,
							0
						),
						await contracts.mock.convertUIntToBytes32(ErrorsNamespace.OK)
					)
					await contracts.jobController.rejectWorkResults(jobId, { from: client, })
					await asserts.throws(contracts.mock.assertExpectations())
				})
			})

			describe("when rejecting work and resolving by referee", () => {

				beforeEach(async () => {
					await contracts.jobController.postJob(jobFlow, 4, 4, 4, jobDefaultPaySize, jobDetailsIPFSHash, { from: client, })
					await contracts.jobController.postJobOfferWithPrice(jobId, workerRate, { from: worker, })
					payment = await contracts.jobController.calculateLockAmountFor.call(worker, jobId)
					await contracts.jobController.acceptOffer(jobId, worker, { from: client, value: payment, })
					await contracts.jobController.startWork(jobId, { from: worker, })
					await timeOps()
					await contracts.jobController.endWork(jobId, { from: worker, })
					await contracts.jobController.rejectWorkResults(jobId, { from: client, })

					clientBalanceBefore = await helpers.getEthBalance(client)
					workerBalanceBefore = await helpers.getEthBalance(worker)
				})

				afterEach(async () => await reverter.revert())

				it("should NOT be able to resolve rejected case when is NOT allowed by Payment Processor", async () => {
					await contracts.paymentProcessor.enableServiceMode()
					assert.isTrue(await contracts.paymentProcessor.serviceMode())
					assert.equal(
						(await contracts.jobController.resolveWorkDispute.call(jobId, workerRate, 0)).toNumber(),
						ErrorsNamespace.PAYMENT_PROCESSOR_OPERATION_IS_NOT_APPROVED
					)
				})

				it("should be able to resolve rejected case when is allowed by Payment Processor", async () => {
					await contracts.paymentProcessor.enableServiceMode()
					assert.isTrue(await contracts.paymentProcessor.serviceMode())

					await contracts.paymentProcessor.approve(jobId)
					assert.equal(
						(await contracts.jobController.resolveWorkDispute.call(jobId, workerRate, 0)).toNumber(),
						ErrorsNamespace.OK
					)
				})

				it("should be able to resolve rejected case in client's favor", async () => {
					await contracts.jobController.resolveWorkDispute(jobId, 0, 0)
					assert.equal(
						(await helpers.getEthBalance(client)).toString(16),
						clientBalanceBefore.plus(workerRate).toString(16)
					)
					assert.equal(
						(await helpers.getEthBalance(worker)).toString(16),
						workerBalanceBefore.toString(16)
					)
					assert.equal(
						(await contracts.paymentGateway.getBalance.call(jobId)).toString(16),
						'0'
					)
				})

				it("should be able to resolve rejected case in worker's favor", async () => {
					await contracts.jobController.resolveWorkDispute(jobId, workerRate, 0)
					assert.equal(
						(await helpers.getEthBalance(client)).toString(16),
						clientBalanceBefore.toString(16)
					)
					assert.equal(
						(await helpers.getEthBalance(worker)).toString(16),
						workerBalanceBefore.plus(workerRate).toString(16)
					)
					assert.equal(
						(await contracts.paymentGateway.getBalance.call(jobId)).toString(16),
						'0'
					)
				})

				it("should be able to resolve rejected case in 50/50", async () => {
					await contracts.jobController.resolveWorkDispute(jobId, workerRate / 2, 0)
					assert.equal(
						(await helpers.getEthBalance(client)).toString(16),
						clientBalanceBefore.plus(workerRate - workerRate / 2).toString(16)
					)
					assert.equal(
						(await helpers.getEthBalance(worker)).toString(16),
						workerBalanceBefore.plus(workerRate / 2).toString(16)
					)
					assert.equal(
						(await contracts.paymentGateway.getBalance.call(jobId)).toString(16),
						'0'
					)
				})

				it("should NOT be able to resolve rejected case in worker's favor with overflown value", async () => {
					await asserts.throws(
						contracts.jobController.resolveWorkDispute(jobId, workerRate + 1, 0)
					)
					assert.equal(
						(await contracts.paymentGateway.getBalance.call(jobId)).toString(16),
						workerRate.toString(16)
					)
				})

				it("should be able to resolve rejected case in worker's favor with penalty fee value when no fee address was set up", async () => {
					const penaltyFee = 20000
					const workerPart = workerRate - penaltyFee
					await contracts.jobController.resolveWorkDispute(jobId, workerRate - penaltyFee, penaltyFee + 1)
					assert.equal(
						(await helpers.getEthBalance(client)).toString(16),
						clientBalanceBefore.plus(workerRate - workerPart).toString(16)
					)
					assert.equal(
						(await helpers.getEthBalance(worker)).toString(16),
						workerBalanceBefore.plus(workerPart).toString(16)
					)
					assert.equal(
						(await contracts.paymentGateway.getBalance.call(jobId)).toString(16),
						'0'
					)
				})

				it("should NOT be able to resolve rejected case in worker's favor with penalty fee value when their sum overflows", async () => {
					const feeAddress = '0xffffffffffffffffffffffffffffffffffff0000'
					const penaltyFee = 20000
					await contracts.paymentGateway.setFeeAddress(feeAddress)
					assert.equal(await contracts.paymentGateway.getFeeAddress(), feeAddress)

					await asserts.throws(
						contracts.jobController.resolveWorkDispute(jobId, workerRate - penaltyFee, penaltyFee + 1)
					)
					assert.equal(
						(await contracts.paymentGateway.getBalance.call(jobId)).toString(16),
						workerRate.toString(16)
					)
				})

				it("should be able to resolve rejected case in worker's favor with penalty fee value", async () => {
					const feeAddress = '0xffffffffffffffffffffffffffffffffffff0000'
					const penaltyFee = 20000
					await contracts.paymentGateway.setFeeAddress(feeAddress)
					assert.equal(await contracts.paymentGateway.getFeeAddress(), feeAddress)

					const workerPart = workerRate - penaltyFee
					await contracts.jobController.resolveWorkDispute(jobId, workerPart, penaltyFee)
					assert.equal(
						(await helpers.getEthBalance(client)).toString(16),
						clientBalanceBefore.toString(16)
					)
					assert.equal(
						(await helpers.getEthBalance(worker)).toString(16),
						workerBalanceBefore.plus(workerPart).toString(16)
					)
					assert.equal(
						(await contracts.paymentGateway.getBalance.call(feeAddress)).toString(16),
						penaltyFee.toString(16)
					)
					assert.equal(
						(await contracts.paymentGateway.getBalance.call(jobId)).toString(16),
						'0'
					)
				})
			})
		})
	})
})