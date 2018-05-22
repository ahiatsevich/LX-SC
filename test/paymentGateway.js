"use strict";

const BalanceHolder = artifacts.require('./BalanceHolder.sol');
const Mock = artifacts.require('./Mock.sol');
const MultiEventsHistory = artifacts.require('./MultiEventsHistory.sol');
const PaymentGateway = artifacts.require('./PaymentGateway.sol');
const SkillsLibrary = artifacts.require('./SkillsLibrary.sol');
const Roles2Library = artifacts.require('./Roles2Library.sol');
const Roles2LibraryInterface = artifacts.require('./Roles2LibraryInterface.sol');
const Storage = artifacts.require('./Storage.sol');

const Asserts = require('./helpers/asserts');
const Reverter = require('./helpers/reverter');
const eventsHelper = require('./helpers/eventsHelper');
const helpers = require('./helpers/helpers');
const ErrorsNamespace = require('../common/errors')


contract('PaymentGateway', function(accounts) {
  const reverter = new Reverter(web3);
  afterEach('revert', reverter.revert);

  const asserts = Asserts(assert);
  const PaymentProcessorRole = 34;
  let storage;
  let multiEventsHistory;
  let paymentGateway;
  let balanceHolder;
  let paymentProcessor = accounts[5];
  let authorizedUserInProcessor = accounts[9] // NOTE: just to test deposit function
  let roles2LibraryInterface = web3.eth.contract(Roles2LibraryInterface.abi).at('0x0');
  let mock;


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

  const assertInternalBalance = (address, expectedValue, hex=false) => {
    return (actualValue) => {
      if (!hex) {
        return paymentGateway.getBalance(address)
          .then(asserts.equal(expectedValue));
      } else {
        return paymentGateway.getBalance(address)
          .then(result => assert.equal('0x'+result.toString(16), expectedValue))
      }
    };
  };

  const deposit = async (depositor, value) => {
    return await paymentGateway.transferWithFee(
      depositor, depositor, 0, 0, { from: authorizedUserInProcessor, value: value, }
    )
  }

  const error = (tx, text) => {
    helpers.error(
      tx, multiEventsHistory, paymentGateway, text
    );
  }

  before('setup', () => {
    return Mock.deployed()
    .then(instance => mock = instance)
    .then(() => Storage.deployed())
    .then(instance => storage = instance)
    .then(() => BalanceHolder.deployed())
    .then(instance => balanceHolder = instance)
    .then(() => PaymentGateway.deployed())
    .then(instance => paymentGateway = instance)
    .then(() => MultiEventsHistory.deployed())
    .then(instance => multiEventsHistory = instance)
    .then(() => paymentGateway.setBalanceHolder(balanceHolder.address))
    .then(() => Roles2Library.deployed())
    .then(async (rolesLibrary) => {
      await rolesLibrary.addUserRole(paymentProcessor, PaymentProcessorRole)
      await rolesLibrary.addUserRole(authorizedUserInProcessor, PaymentProcessorRole)
    })
    .then(reverter.snapshot);
  });


  describe("Contract setup", () => {

    it('should check auth on setup events history', () => {
      const caller = accounts[1];
      const newAddress = '0xffffffffffffffffffffffffffffffffffffffff';
      return Promise.resolve()
        .then(() => paymentGateway.setRoles2Library(Mock.address))
        .then(() => mock.expect(
          paymentGateway.address,
          0,
          roles2LibraryInterface.canCall.getData(
            caller,
            paymentGateway.address,
            paymentGateway.contract.setupEventsHistory.getData(newAddress).slice(0, 10)
          ), 0)
        )
        .then(() => paymentGateway.setupEventsHistory(newAddress, {from: caller}))
        .then(assertExpectations());
    });

    it('should check auth on setting balance holder', () => {
      const caller = accounts[1];
      const newAddress = '0xffffffffffffffffffffffffffffffffffffffff';
      return Promise.resolve()
        .then(() => paymentGateway.setRoles2Library(Mock.address))
        .then(() => mock.expect(
          paymentGateway.address,
          0,
          roles2LibraryInterface.canCall.getData(
            caller,
            paymentGateway.address,
            paymentGateway.contract.setBalanceHolder.getData(newAddress).slice(0, 10)
          ), 0)
        )
        .then(() => paymentGateway.setBalanceHolder(newAddress, {from: caller}))
        .then(assertExpectations());
    });

    it('should check auth on setting fee address', () => {
      const caller = accounts[1];
      const feeAddress = '0xffffffffffffffffffffffffffffffffffffffff';
      return Promise.resolve()
        .then(() => paymentGateway.setRoles2Library(Mock.address))
        .then(() => mock.expect(
          paymentGateway.address,
          0,
          roles2LibraryInterface.canCall.getData(
            caller,
            paymentGateway.address,
            paymentGateway.contract.setFeeAddress.getData(feeAddress).slice(0, 10)
          ), 0)
        )
        .then(() => paymentGateway.setFeeAddress(feeAddress, {from: caller}))
        .then(assertExpectations())
        .then(() => paymentGateway.getFeeAddress())
        .then(asserts.equal('0x0000000000000000000000000000000000000000'));
    });

    it('should set fee address', () => {
      const feeAddress = '0xffffffffffffffffffffffffffffffffffffffff';
      return Promise.resolve()
      .then(() => paymentGateway.setFeeAddress(feeAddress))
      .then(() => paymentGateway.getFeeAddress())
      .then(asserts.equal(feeAddress));
    });

    it('should check auth on setting fee percent', () => {
      const caller = accounts[1];
      const feePercent = 1333;
      return Promise.resolve()
      .then(() => paymentGateway.setRoles2Library(Mock.address))
      .then(() => mock.expect(
        paymentGateway.address,
        0,
        roles2LibraryInterface.canCall.getData(
          caller,
          paymentGateway.address,
          paymentGateway.contract.setFeePercent.getData(feePercent).slice(0, 10)
        ), 0)
      )
      .then(() => paymentGateway.setFeePercent(feePercent, {from: caller}))
      .then(assertExpectations())
      .then(() => paymentGateway.getFeePercent())
      .then(asserts.equal(0));
    });

    it('should set fee percent', () => {
      const feePercent = 1333;
      return Promise.resolve()
      .then(() => paymentGateway.setFeePercent(feePercent))
      .then(() => paymentGateway.getFeePercent())
      .then(asserts.equal(feePercent));
    });

    it('should emit FeeSet event in MultiEventsHistory', () => {
      const feePercent = 1333;
      return Promise.resolve()
      .then(() => paymentGateway.setFeePercent(feePercent))
      .then(tx => eventsHelper.extractEvents(tx, "FeeSet"))
      .then(events => {
        assert.equal(events.length, 1);
        assert.equal(events[0].address, multiEventsHistory.address);
        assert.equal(events[0].args.feePercent, 1333);
        assert.equal(events[0].args.self, paymentGateway.address);
      });
    });

    it('should NOT set fee percent higher than or equal to 100%', () => {
      const feePercent = 10000;
      return Promise.resolve()
      .then(() => asserts.throws(
          paymentGateway.setFeePercent(feePercent)
      ))
      .then(() => paymentGateway.getFeePercent())
      .then(asserts.equal(0))
      .then(() => paymentGateway.setFeePercent(feePercent - 1))
      .then(() => paymentGateway.getFeePercent())
      .then(asserts.equal(feePercent - 1));
    });

  });


  describe('Internal transfer with fee', () => {

    it("should check auth on internal transfer with fee", () => {
      const sender = accounts[6];
      const receiver = '0xffffffffffffffffffffffffffffffffffffff00';
      const value = 1000;
      
      return Promise.resolve()
        .then(() => paymentGateway.setRoles2Library(Mock.address))
        .then(() => mock.expect(
          paymentGateway.address,
          0,
          roles2LibraryInterface.canCall.getData(
            sender,
            paymentGateway.address,
            paymentGateway.contract.transferWithFee.getData(sender, receiver, value, 0).slice(0,10)
          ), 0)
        )
        .then(() => paymentGateway.transferWithFee(
          sender, receiver, value, 0, { from: sender, value: value, }
        ))
        .then(assertExpectations())
        .then(assertInternalBalance(receiver, 0))
        .then(assertInternalBalance(sender, 0))
    });

    it("should NOT perform internal transfer with fee with null _from address", () => {
      const sender = accounts[6];
      const receiver = '0xffffffffffffffffffffffffffffffffffffff00';
      const value = 1000;
      return Promise.resolve()
        .then(() => deposit(sender, value))
        .then(() => asserts.throws(
            paymentGateway.transferWithFee('0x0', receiver, value, 0, { from: paymentProcessor, value: value, })
        ))
        .then(assertInternalBalance(receiver, 0))
        .then(assertInternalBalance(sender, value))
    });

    it("should THROW on internal transfer with fee with null _to address", () => {
      const sender = accounts[6];
      const receiver = '0x0';
      const value = 1000;
      return Promise.resolve()
        .then(() => deposit(sender, value))
        .then(() => asserts.throws(
          paymentGateway.transferWithFee(
            sender, receiver, value, 0, { from: paymentProcessor, value: value, }
          )
        ))
        .then(assertInternalBalance(receiver, 0))
        .then(assertInternalBalance(sender, value))
    });

    it("should THROW on internal transfer with fee with null _value", () => {
      const sender = accounts[6];
      const receiver = '0xffffffffffffffffffffffffffffffffffffff00';
      const value = 1000;
      const transfer = 0;
      return Promise.resolve()
        .then(() => deposit(sender, value))
        .then(() => asserts.throws(
          paymentGateway.transferWithFee(
            sender, receiver, value, 0, { from: paymentProcessor, value: transfer, }
          )
        ))
        .then(assertInternalBalance(receiver, 0))
        .then(assertInternalBalance(sender, value))
    });

    it('should perform internal transfer with fee ' +
       'emitting Transferred event in MultiEventsHistory', () => {
      const feeAddress = '0x00ffffffffffffffffffffffffffffffffffffff';
      const feePercent = 100;
      const sender = accounts[6];
      const receiver = '0xffffffffffffffffffffffffffffffffffffff00';
      const firstTransfer = 700;
      const secondTransfer = 300;
      const value = firstTransfer + secondTransfer;
      const fee = 3;
      const result = firstTransfer - fee;
      return Promise.resolve()
        .then(() => deposit(sender, firstTransfer))
        .then(() => paymentGateway.setFeeAddress(feeAddress))
        .then(() => paymentGateway.setFeePercent(feePercent))
        .then(() => paymentGateway.transferWithFee(
            sender, receiver, secondTransfer, 0, { from: paymentProcessor, value: secondTransfer, }
          )
        )
        .then(tx => eventsHelper.extractEvents(tx, "Transferred"))
        .then(events => {
          assert.equal(events.length, 2);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'Transferred');
          assert.equal(events[0].args.from, sender);
          assert.equal(events[0].args.to, receiver);
          assert.equal(events[0].args.value.valueOf(), secondTransfer);
          assert.equal(events[1].address, multiEventsHistory.address);
          assert.equal(events[1].event, 'Transferred');
          assert.equal(events[1].args.from, sender);
          assert.equal(events[1].args.to, feeAddress);
          assert.equal(events[1].args.value.valueOf(), fee);
        })
        .then(assertInternalBalance(sender, result))
        .then(assertInternalBalance(receiver, secondTransfer))
        .then(assertInternalBalance(feeAddress, fee))
    });
  });


  describe('Internal transfer to many', () => {

    it('should check auth on internal transfer to many', () => {
      const sender = accounts[6];
      const receiver1 = '0xffffffffffffffffffffffffffffffffffffff00';
      const receiver2 = '0xffffffffffffffffffffffffffffffffffff0000';
      const value = 1000;
      const receiver1Value = 100;
      const receiver2Value = 200;
      const receiver1Result = 0;
      const receiver2Result = 0;
      const result = 1000;
      return Promise.resolve()
      .then(() => paymentGateway.setRoles2Library(Mock.address))
      .then(() => {
        const expectedSig = paymentGateway.contract.transferToMany.getData(sender, [receiver1, receiver2], [receiver1Value, receiver2Value], 0, 0).slice(0,10)
        return mock.expect(
          paymentGateway.address,
          0,
          roles2LibraryInterface.canCall.getData(
            sender,
            paymentGateway.address,
            expectedSig
          ), 0)
        }
      )
      .then(() => paymentGateway.transferToMany(
        sender, [receiver1, receiver2], [receiver1Value, receiver2Value],
        0, 0, { from: sender, value: receiver1Value + receiver2Value, }
      ))
      .then(assertExpectations())
      .then(assertInternalBalance(receiver1, receiver1Result))
      .then(assertInternalBalance(receiver2, receiver2Result))
      .then(assertInternalBalance(sender, 0))
    });

    it('should THROWS on performing internal transfer to many with null _from address', () => {
      const sender = '0x0';
      const receiver1 = accounts[7];
      const receiver2 = accounts[8];
      const receiver1Value = 100;
      const receiver2Value = 200;
      const receiver1Result = 0;
      const receiver2Result = 0;
      const senderResult = 1000;

      return Promise.resolve()
        .then(() => asserts.throws(paymentGateway.transferToMany(
            sender, [receiver1, receiver2], [receiver1Value, receiver2Value],
            0, 0, { from: paymentProcessor, value: senderResult, }
          )
        ))
        .then(assertInternalBalance(receiver1, receiver1Result))
        .then(assertInternalBalance(receiver2, receiver2Result))
        .then(assertInternalBalance(sender, 0))
    });

    
    it('should THROW on internal transfer to many if _to and _value arrays have null length', () => {
      const sender = accounts[6];
      const value = 1000;

      return Promise.resolve()
        .then(() => asserts.throws(paymentGateway.transferToMany(
            sender, [], [],
            0, 0, { from: paymentProcessor, value: value, }
          )
        ))
        .then(assertInternalBalance(sender, 0))
    });

    it('should THROW on performing internal transfer to many if input arrays have different length', () => {
      const sender = accounts[6];
      const receiver1 = accounts[7];
      const receiver2 = accounts[8];
      const receiver1Value = 100;
      const receiver2Value = 200;
      const receiver1Result = 0;
      const receiver2Result = 0;
      const senderResult = 1000;

      return Promise.resolve()
        .then(() => asserts.throws(paymentGateway.transferToMany(
            sender, [receiver1, receiver2, accounts[3]], [receiver1Value, receiver2Value],
            0, 0, { from: paymentProcessor, value: senderResult, }
          )
        ))
        .then(assertInternalBalance(receiver1, receiver1Result))
        .then(assertInternalBalance(receiver2, receiver2Result))
        .then(assertInternalBalance(sender, 0))
    });

    it('should THROW on internal transfer to many if one of the receivers is null address', () => {
      const sender = accounts[6];
      const receiver1 = '0x0';
      const receiver2 = accounts[8];
      const receiver1Value = 100;
      const receiver2Value = 200;
      const receiver1Result = 0;
      const receiver2Result = 0;
      const senderResult = 1000;

      return Promise.resolve()
        .then(() => asserts.throws(paymentGateway.transferToMany(
            sender, [receiver1, receiver2], [receiver1Value, receiver2Value],
            0, 0, { from: paymentProcessor, value: senderResult, }
          )
        ))
        .then(assertInternalBalance(receiver1, receiver1Result))
        .then(assertInternalBalance(receiver2, receiver2Result))
        .then(assertInternalBalance(sender, 0))
    });

    it('should THROW on internal transfer to many if one of the values is null', () => {
      const sender = accounts[6];
      const receiver1 = accounts[7];
      const receiver2 = accounts[8];
      const receiver1Value = 100;
      const receiver2Value = 0;
      const receiver1Result = 0;
      const receiver2Result = 0;
      const senderResult = 1000;

      return Promise.resolve()
        .then(() => asserts.throws(paymentGateway.transferToMany(
            sender, [receiver1, receiver2], [receiver1Value, receiver2Value],
            0, 0, { from: paymentProcessor, value: senderResult, }
          )
        ))
        .then(assertInternalBalance(receiver1, receiver1Result))
        .then(assertInternalBalance(receiver2, receiver2Result))
        .then(assertInternalBalance(sender, 0))
    });

    it('should THROW on internal transfer to many if not enough balance', () => {
      const sender = accounts[6];
      const receiver1 = '0xffffffffffffffffffffffffffffffffffffff00';
      const receiver2 = '0xffffffffffffffffffffffffffffffffffff0000';
      const receiver1Result = 0;
      const receiver2Result = 0;
      const value = 1000;

      return Promise.resolve()
        .then(() => asserts.throws(paymentGateway.transferToMany(
            sender, [receiver1, receiver2], [value, 1],
            0, 0, { from: paymentProcessor, value: value, }
          )
        ))
        .then(assertInternalBalance(receiver1, receiver1Result))
        .then(assertInternalBalance(receiver2, receiver2Result))
        .then(assertInternalBalance(sender, 0))
    });

    it('should NOT take fee percent on internal transfer to many if feePercent is 0', () => {
      const feeAddress = '0x00ffffffffffffffffffffffffffffffffffffff';
      const sender = accounts[6];
      const receiver1 = '0xffffffffffffffffffffffffffffffffffffff00';
      const receiver2 = '0xffffffffffffffffffffffffffffffffffff0000';
      const value = 1000;
      const receiver1Value = 100;
      const receiver2Value = 200;
      const receiver1Result = 100;
      const receiver2Result = 200;
      const result = 700;

      return Promise.resolve()
        .then(() => paymentGateway.setFeeAddress(feeAddress))
        .then(() => paymentGateway.transferToMany(
            sender, [receiver1, receiver2], [receiver1Value, receiver2Value],
            0, 0, { from: paymentProcessor, value: value, }
          )
        )
        .then(assertInternalBalance(receiver1, receiver1Result))
        .then(assertInternalBalance(receiver2, receiver2Result))
        .then(assertInternalBalance(sender, result))
        .then(assertInternalBalance(feeAddress, 0))
    });

    it('should NOT take fee percent on internal transfer to many if feeAddress is not set', () => {
      const feePercent = 100;
      const sender = accounts[6];
      const receiver1 = '0xffffffffffffffffffffffffffffffffffffff00';
      const receiver2 = '0xffffffffffffffffffffffffffffffffffff0000';
      const value = 1000;
      const receiver1Value = 100;
      const receiver2Value = 200;
      const receiver1Result = 100;
      const receiver2Result = 200;
      const result = 700;

      return Promise.resolve()
        .then(() => paymentGateway.setFeePercent(feePercent))
        .then(() => paymentGateway.transferToMany(
            sender, [receiver1, receiver2], [receiver1Value, receiver2Value],
            0, 0, { from: paymentProcessor, value: value, }
          )
        )
        .then(assertInternalBalance(receiver1, receiver1Result))
        .then(assertInternalBalance(receiver2, receiver2Result))
        .then(assertInternalBalance(sender, result))
    });

    it('should THROW on internal transfer to many if cannot take fee percent', () => {
      const feeAddress = '0x00ffffffffffffffffffffffffffffffffffffff';
      const feePercent = 100;
      const sender = accounts[6];
      const receiver1 = '0xffffffffffffffffffffffffffffffffffffff00';
      const receiver2 = '0xffffffffffffffffffffffffffffffffffff0000';
      const value = 300;
      const receiver1Value = 100;
      const receiver2Value = 200;

      return Promise.resolve()
        .then(() => paymentGateway.setFeeAddress(feeAddress))
        .then(() => paymentGateway.setFeePercent(feePercent))
        .then(() => asserts.throws(paymentGateway.transferToMany(
            sender, [receiver1, receiver2], [receiver1Value, receiver2Value],
            feePercent, 0, { from: paymentProcessor, value: value, }
          )
        ))
        .then(assertInternalBalance(receiver1, 0))
        .then(assertInternalBalance(receiver2, 0))
        .then(assertInternalBalance(sender, 0))
        .then(assertInternalBalance(feeAddress, 0))
    });

    it('should NOT take additional fee on internal transfer to many if feeAddress is not set', () => {
      const additionalFee = 100;
      const sender = accounts[6];
      const receiver1 = '0xffffffffffffffffffffffffffffffffffffff00';
      const receiver2 = '0xffffffffffffffffffffffffffffffffffff0000';
      const value = 1000;
      const receiver1Value = 100;
      const receiver2Value = 200;
      const receiver1Result = 100;
      const receiver2Result = 200;
      const result = 700;
      
      return Promise.resolve()
        .then(() => paymentGateway.transferToMany(
            sender, [receiver1, receiver2], [receiver1Value, receiver2Value],
            0, additionalFee, { from: paymentProcessor, value: value, }
          )
        )
        .then(assertInternalBalance(receiver1, receiver1Result))
        .then(assertInternalBalance(receiver2, receiver2Result))
        .then(assertInternalBalance(sender, result))
    });

    it('should THROW on internal transfer to many if cannot take additional fee', () => {
      const feeAddress = '0x00ffffffffffffffffffffffffffffffffffffff';
      const additionalFee = 1;
      const sender = accounts[6];
      const receiver1 = '0xffffffffffffffffffffffffffffffffffffff00';
      const receiver2 = '0xffffffffffffffffffffffffffffffffffff0000';
      const value = 300;
      const receiver1Value = 100;
      const receiver2Value = 200;

      return Promise.resolve()
        .then(() => paymentGateway.setFeeAddress(feeAddress))
        .then(() => asserts.throws(paymentGateway.transferToMany(
            sender, [receiver1, receiver2], [receiver1Value, receiver2Value],
            0, additionalFee, { from: paymentProcessor, value: value, }
          )
        ))
        .then(assertInternalBalance(receiver1, 0))
        .then(assertInternalBalance(receiver2, 0))
        .then(assertInternalBalance(sender, 0))
        .then(assertInternalBalance(feeAddress, 0))
    });

    it('should perform internal transfer to many', () => {
      const sender = accounts[6];
      const receiver1 = accounts[7];
      const receiver2 = accounts[8];
      const receiver1Value = 100;
      const receiver2Value = 200;
      const receiver1Result = 100;
      const receiver2Result = 200;
      const senderResult = 700;
      const value = 1000

      return Promise.resolve()
        .then(() => paymentGateway.transferToMany(
            sender, [receiver1, receiver2], [receiver1Value, receiver2Value],
            0, 0, { from: paymentProcessor, value: value, }
          )
        )
        .then(assertInternalBalance(receiver1, receiver1Result))
        .then(assertInternalBalance(receiver2, receiver2Result))
        .then(assertInternalBalance(sender, senderResult))
    });

    it('should take fee percent on internal transfer to many', () => {
      const feeAddress = '0x00ffffffffffffffffffffffffffffffffffffff';
      const feePercent = 100;
      const sender = accounts[6];
      const receiver1 = '0xffffffffffffffffffffffffffffffffffffff00';
      const receiver2 = '0xffffffffffffffffffffffffffffffffffff0000';
      const value = 1000;
      const receiver1Value = 100;
      const receiver2Value = 200;
      const receiver1Result = 100;
      const receiver2Result = 200;
      const fee = 10;
      const result = 690;

      return Promise.resolve()
        .then(() => paymentGateway.setFeeAddress(feeAddress))
        .then(() => paymentGateway.setFeePercent(feePercent))
        .then(() => paymentGateway.transferToMany(
            sender, [receiver1, receiver2], [receiver1Value, receiver2Value],
            value, 0, { from: paymentProcessor, value: value, }
          )
        )
        .then(assertInternalBalance(receiver1, receiver1Result))
        .then(assertInternalBalance(receiver2, receiver2Result))
        .then(assertInternalBalance(sender, result))
        .then(assertInternalBalance(feeAddress, fee))
    });

    it('should take fee percent from specified value on internal transfer to many', () => {
      const feeAddress = '0x00ffffffffffffffffffffffffffffffffffffff';
      const feePercent = 100;
      const sender = accounts[6];
      const receiver1 = '0xffffffffffffffffffffffffffffffffffffff00';
      const receiver2 = '0xffffffffffffffffffffffffffffffffffff0000';
      const value = 1000;
      const feeFrom = 100;
      const receiver1Value = 100;
      const receiver2Value = 200;
      const receiver1Result = 100;
      const receiver2Result = 200;
      const fee = 1;
      const result = 699;

      return Promise.resolve()
        .then(() => paymentGateway.setFeeAddress(feeAddress))
        .then(() => paymentGateway.setFeePercent(feePercent))
        .then(() => paymentGateway.transferToMany(
            sender, [receiver1, receiver2], [receiver1Value, receiver2Value],
            feeFrom, 0, { from: paymentProcessor, value: value, }
          )
        )
        .then(assertInternalBalance(receiver1, receiver1Result))
        .then(assertInternalBalance(receiver2, receiver2Result))
        .then(assertInternalBalance(sender, result))
        .then(assertInternalBalance(feeAddress, fee))
    });

    it('should emit Transferred events in MultiEventsHistory on internal transfer to many', () => {
      const feeAddress = '0x00ffffffffffffffffffffffffffffffffffffff';
      const feePercent = 200;
      const additionalFee = 100;
      const sender = accounts[6];
      const receiver1 = '0xffffffffffffffffffffffffffffffffffffff00';
      const receiver2 = '0xffffffffffffffffffffffffffffffffffff0000';
      const value = 1000;
      const receiver1Value = 100;
      const receiver2Value = 200;
      const receiver1Result = 100;
      const receiver2Result = 200;
      const result = 580;
      const fee = 120;

      return Promise.resolve()
        .then(() => paymentGateway.setFeeAddress(feeAddress))
        .then(() => paymentGateway.setFeePercent(feePercent))
        .then(() => paymentGateway.transferToMany(
            sender, [receiver1, receiver2], [receiver1Value, receiver2Value],
            value, additionalFee, { from: paymentProcessor, value: value, }
          )
        )
        .then(tx => eventsHelper.extractEvents(tx, "Transferred"))
        .then(events => {
          assert.equal(events.length, 3);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'Transferred');
          assert.equal(events[0].args.from, sender);
          assert.equal(events[0].args.to, receiver1);
          assert.equal(events[0].args.value.valueOf(), receiver1Result);
          
          assert.equal(events[1].address, multiEventsHistory.address);
          assert.equal(events[1].event, 'Transferred');
          assert.equal(events[1].args.from, sender);
          assert.equal(events[1].args.to, receiver2);
          assert.equal(events[1].args.value.valueOf(), receiver2Result);
          
          assert.equal(events[2].address, multiEventsHistory.address);
          assert.equal(events[2].event, 'Transferred');
          assert.equal(events[2].args.from, sender);
          assert.equal(events[2].args.to, feeAddress);
          assert.equal(events[2].args.value.valueOf(), fee);
        })
        .then(assertInternalBalance(receiver1, receiver1Result))
        .then(assertInternalBalance(receiver2, receiver2Result))
        .then(assertInternalBalance(sender, result))
        .then(assertInternalBalance(feeAddress, fee))
    });

    it('should take additional fee on internal transfer to many', () => {
      const feeAddress = '0x00ffffffffffffffffffffffffffffffffffffff';
      const additionalFee = 100;
      const sender = accounts[6];
      const receiver1 = '0xffffffffffffffffffffffffffffffffffffff00';
      const receiver2 = '0xffffffffffffffffffffffffffffffffffff0000';
      const value = 1000;
      const receiver1Value = 100;
      const receiver2Value = 200;
      const receiver1Result = 100;
      const receiver2Result = 200;
      const result = 600;

      return Promise.resolve()
        .then(() => paymentGateway.setFeeAddress(feeAddress))
        .then(() => paymentGateway.transferToMany(
            sender, [receiver1, receiver2], [receiver1Value, receiver2Value],
            0, additionalFee, { from: paymentProcessor, value: value, }
          )
        )
        .then(assertInternalBalance(receiver1, receiver1Result))
        .then(assertInternalBalance(receiver2, receiver2Result))
        .then(assertInternalBalance(sender, result))
        .then(assertInternalBalance(feeAddress, additionalFee))
    });

    it('should take additional fee and fee percent on internal transfer to many', () => {
      const feeAddress = '0x00ffffffffffffffffffffffffffffffffffffff';
      const feePercent = 200;
      const additionalFee = 100;
      const sender = accounts[6];
      const receiver1 = '0xffffffffffffffffffffffffffffffffffffff00';
      const receiver2 = '0xffffffffffffffffffffffffffffffffffff0000';
      const value = 1000;
      const receiver1Value = 100;
      const receiver2Value = 200;
      const receiver1Result = 100;
      const receiver2Result = 200;
      const result = 580;
      const fee = 120;

      return Promise.resolve()
        .then(() => paymentGateway.setFeeAddress(feeAddress))
        .then(() => paymentGateway.setFeePercent(feePercent))
        .then(() => paymentGateway.transferToMany(
            sender, [receiver1, receiver2], [receiver1Value, receiver2Value],
            value, additionalFee, { from: paymentProcessor, value: value, }
          )
        )
        .then(assertInternalBalance(receiver1, receiver1Result))
        .then(assertInternalBalance(receiver2, receiver2Result))
        .then(assertInternalBalance(sender, result))
        .then(assertInternalBalance(feeAddress, fee))
    });

  });


  describe('Transfer all', () => {

    it('should should check auth on `transferAll`', () => {
      const sender = accounts[6];
      const receiver = '0xffffffffffffffffffffffffffffffffffffff00';
      const changeAddress = '0xffffffffffffffffffffffffffffffffffffff01';
      const value = 1000;

      return Promise.resolve()
        .then(() => deposit(sender, value))
        .then(() => {
          const expectedSig = helpers.getSig("transferAll(address,address,uint256,address,uint256,uint256,address)");
          return mock.expect(
            paymentGateway.address,
            0,
            roles2LibraryInterface.canCall.getData(
              sender,
              paymentGateway.address,
              expectedSig
            ), 0)
          }
        )
        .then(() => paymentGateway.setRoles2Library(Mock.address))
        .then(() => paymentGateway.transferAll(
          sender, receiver, value, changeAddress, value, 0,
          { from: sender, }
        ))
        .then(assertInternalBalance(sender, 0))
        .then(assertInternalBalance(receiver, value))
        .then(assertInternalBalance(changeAddress, 0))
    });

    it('should THROW on performing `transferAll` if _from address is null', () => {
      const sender = accounts[6];
      const receiver = '0xffffffffffffffffffffffffffffffffffffff00';
      const changeAddress = '0xffffffffffffffffffffffffffffffffffffff01';
      const balance = 5000;
      const value = 1000;

      const fakeSender = '0x0';
      return Promise.resolve()
        .then(() => deposit(sender, balance))
        .then(() => asserts.throws(
            paymentGateway.transferAll(
              fakeSender, receiver, value, changeAddress, value, 0,
              { from: paymentProcessor, }
            )
        ))
        .then(assertInternalBalance(sender, balance))
        .then(assertInternalBalance(receiver, 0))
        .then(assertInternalBalance(changeAddress, 0))
    });

    it('should THROW on `transferAll` if _to address is null', () => {
      const sender = accounts[6];
      const receiver = '0xffffffffffffffffffffffffffffffffffffff00';
      const changeAddress = '0xffffffffffffffffffffffffffffffffffffff01';
      const balance = 5000;
      const value = 1000;

      const fakeReceiver = '0x0';
      return Promise.resolve()
        .then(() => deposit(sender, balance))
        .then(() => asserts.throws(
          paymentGateway.transferAll(
            sender, fakeReceiver, value, changeAddress, value, 0,
            { from: paymentProcessor, }
          )
        ))
        .then(assertInternalBalance(sender, balance))
        .then(assertInternalBalance(fakeReceiver, 0))
        .then(assertInternalBalance(receiver, 0))
        .then(assertInternalBalance(changeAddress, 0))
    });

    it('should THROW on `transferAll` if _value is null', () => {
      const sender = accounts[6];
      const receiver = '0xffffffffffffffffffffffffffffffffffffff00';
      const changeAddress = '0xffffffffffffffffffffffffffffffffffffff01';
      const balance = 5000;
      const value = 0;

      return Promise.resolve()
        .then(() => deposit(sender, balance))
        .then(() => asserts.throws(
          paymentGateway.transferAll(
            sender, receiver, value, changeAddress, value, 0,
            { from: paymentProcessor, }
          )
        ))
        .then(assertInternalBalance(sender, balance))
        .then(assertInternalBalance(receiver, 0))
        .then(assertInternalBalance(changeAddress, 0))
    });

    it('should THROW on `transferAll` if there is a change left but change address is null', () => {
      const sender = accounts[6];
      const receiver = '0xffffffffffffffffffffffffffffffffffffff00';
      const changeAddress = '0x0';
      const balance = 5000;
      const value = 1000;

      return Promise.resolve()
        .then(() => deposit(sender, balance))
        .then(() => asserts.throws(
          paymentGateway.transferAll(
            sender, receiver, value, changeAddress, value, 0,
            { from: paymentGateway, }
          )
        ))
        .then(assertInternalBalance(sender, balance))
        .then(assertInternalBalance(receiver, 0))
        .then(assertInternalBalance(changeAddress, 0))
    })

    it('should THROW on `transferAll` if sender has insufficient balance', () => {
      const sender = accounts[6];
      const receiver = '0xffffffffffffffffffffffffffffffffffffff00';
      const changeAddress = '0xffffffffffffffffffffffffffffffffffffff01';
      const balance = 1000;
      const value = 1001;

      return Promise.resolve()
        .then(() => deposit(sender, balance))
        .then(() => asserts.throws(paymentGateway.transferAll(
          sender, receiver, value, changeAddress, value, 0,
          { from: paymentGateway, }
        )))
        .then(assertInternalBalance(sender, balance))
        .then(assertInternalBalance(receiver, 0))
        .then(assertInternalBalance(changeAddress, 0))
    });

    it('should THROW on `transferAll` if cannot take fee percent', () => {
      const sender = accounts[6];
      const receiver = '0xffffffffffffffffffffffffffffffffffffff00';
      const changeAddress = '0xffffffffffffffffffffffffffffffffffffff01';
      const feeAddress = '0xffffffffffffffffffffffffffffffffffffff02';
      const balance = 1100;
      const value = 1000;
      const feePercent = 1100;  // 11% => 110 tokens

      return Promise.resolve()
        .then(() => paymentGateway.setFeeAddress(feeAddress))
        .then(() => paymentGateway.setFeePercent(feePercent))
        .then(() => deposit(sender, balance))
        .then(() => asserts.throws(
          paymentGateway.transferAll(
            sender, receiver, value, changeAddress, value, 0,
            { from: paymentProcessor, }
          )
        ))
        .then(assertInternalBalance(sender, balance))
        .then(assertInternalBalance(receiver, 0))
        .then(assertInternalBalance(changeAddress, 0))
        .then(assertInternalBalance(feeAddress, 0))
    });

    it('should THROW on `transferAll` if cannot take additional fee', () => {
      const sender = accounts[6];
      const receiver = '0xffffffffffffffffffffffffffffffffffffff00';
      const changeAddress = '0xffffffffffffffffffffffffffffffffffffff01';
      const feeAddress = '0xffffffffffffffffffffffffffffffffffffff02';
      const balance = 1100;
      const value = 1000;
      const additionalFee = 101;

      return Promise.resolve()
        .then(() => paymentGateway.setFeeAddress(feeAddress))
        .then(() => deposit(sender, balance))
        .then(() => asserts.throws(
          paymentGateway.transferAll(
            sender, receiver, value, changeAddress, value, additionalFee,
            { from: paymentProcessor, }
          )
        ))
        .then(assertInternalBalance(sender, balance))
        .then(assertInternalBalance(receiver, 0))
        .then(assertInternalBalance(changeAddress, 0))
        .then(assertInternalBalance(feeAddress, 0))
    });

    it('should NOT take fee on `transferAll` if fee is set but fee address is not set', () => {
      const sender = accounts[6];
      const receiver = '0xffffffffffffffffffffffffffffffffffffff00';
      const changeAddress = '0xffffffffffffffffffffffffffffffffffffff01';
      const balance = 5000;
      const value = 1000;
      const feePercent = 1000;  // 10%
      const change = balance - value;

      return Promise.resolve()
        .then(() => paymentGateway.setFeePercent(feePercent))
        .then(() => deposit(sender, balance))
        .then(() => paymentGateway.transferAll(
          sender, receiver, value, changeAddress, value, 0,
          { from: paymentProcessor, }
        ))
        .then(assertInternalBalance(sender, 0))
        .then(assertInternalBalance(receiver, value))
        .then(assertInternalBalance(changeAddress, change))
    });

    it('should distribute correct amount of tokens on `transferAll`', () => {
      const sender = accounts[6];
      const receiver = '0xffffffffffffffffffffffffffffffffffffff00';
      const changeAddress = '0xffffffffffffffffffffffffffffffffffffff01';
      const balance = 5000;
      const value = 1000;
      const change = balance - value;

      return Promise.resolve()
        .then(() => deposit(sender, balance))
        .then(() => paymentGateway.transferAll(
          sender, receiver, value, changeAddress, value, 0,
          { from: paymentProcessor, }
        ))
        .then(assertInternalBalance(sender, 0))
        .then(assertInternalBalance(receiver, value))
        .then(assertInternalBalance(changeAddress, change));
    });

    it('should distribute correct amount of tokens on `transferAll` with fee percent', () => {
      const sender = accounts[6];
      const receiver = '0xffffffffffffffffffffffffffffffffffffff00';
      const changeAddress = '0xffffffffffffffffffffffffffffffffffffff01';
      const feeAddress = '0xffffffffffffffffffffffffffffffffffffff02';
      const balance = 5000;
      const value = 1000;
      const feePercent = 1000;  // 10%
      const fee = value * feePercent / 10000;
      const change = balance - value - fee;

      return Promise.resolve()
        .then(() => paymentGateway.setFeeAddress(feeAddress))
        .then(() => paymentGateway.setFeePercent(feePercent))
        .then(() => deposit(sender, balance))
        .then(() => paymentGateway.transferAll(
          sender, receiver, value, changeAddress, value, 0,
          { from: paymentProcessor, }
        ))
        .then(assertInternalBalance(sender, 0))
        .then(assertInternalBalance(receiver, value))
        .then(assertInternalBalance(feeAddress, fee))
        .then(assertInternalBalance(changeAddress, change));
    });

    it('should distribute correct amount of tokens on' +
      '`transferAll` with fee percent and additional fee', () => {
      const sender = accounts[6];
      const receiver = '0xffffffffffffffffffffffffffffffffffffff00';
      const changeAddress = '0xffffffffffffffffffffffffffffffffffffff01';
      const feeAddress = '0xffffffffffffffffffffffffffffffffffffff02';
      const balance = 5000;
      const value = 1000;
      const feePercent = 1000;  // 10%
      const additionalFee = 200;
      const fee = value * feePercent / 10000;
      const change = balance - value - fee - additionalFee;

      return Promise.resolve()
        .then(() => paymentGateway.setFeeAddress(feeAddress))
        .then(() => paymentGateway.setFeePercent(feePercent))
        .then(() => deposit(sender, balance))
        .then(() => paymentGateway.transferAll(
          sender, receiver, value, changeAddress, value, additionalFee,
          { from: paymentProcessor, }
        ))
        .then(assertInternalBalance(sender, 0))
        .then(assertInternalBalance(receiver, value))
        .then(assertInternalBalance(feeAddress, fee + additionalFee))
        .then(assertInternalBalance(changeAddress, change));
    });

  });

  
  describe('Fees', () => {

    it('should NOT forward null fee value', () => {
      const feeAddress = accounts[6];
      const value = 1000;
      const fakeValue = 0;
      return Promise.resolve()
        .then(() => paymentGateway.setFeeAddress(feeAddress))
        .then(() => deposit(feeAddress, value))
        .then(() => asserts.throws(
            paymentGateway.forwardFee(fakeValue)
        ))
        .then(assertInternalBalance(feeAddress, value))
    });

    it('should NOT forward collected fee if feeAddress is not set', () => {
      const feeAddress = accounts[6];
      const value = 1000;
      return Promise.resolve()
        .then(() => paymentGateway.setFeeAddress(feeAddress))
        .then(() => deposit(feeAddress, value))
        .then(() => paymentGateway.setFeeAddress('0x0'))
        .then(() => paymentGateway.forwardFee(value))
        .then(assertInternalBalance(feeAddress, value))
    });

    it('should THROW on forward fee when underflow happens', () => {
      /**
       * Covered in withdrawal
       */
    });

    it('should NOT forward if error occurred in ERC20 contract', () => {
      /**
       * Covered in withdrawal
       */
    });

    it('should NOT forward more fee than available', () => {
      /**
       * Covered in withdrawal
       */
    });

    it('should forward collected fee, emitting "Withdrawn" event', () => {
      const feeAddress = accounts[6];
      const value = 1000;
      return Promise.resolve()
        .then(() => paymentGateway.setFeeAddress(feeAddress))
        .then(() => deposit(feeAddress, value))
        .then(() => paymentGateway.forwardFee(value))
        .then(tx => eventsHelper.extractEvents(tx, "Withdrawn"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'Withdrawn');
          assert.equal(events[0].args.self, paymentGateway.address);
          assert.equal(events[0].args.by, feeAddress);
          assert.equal(events[0].args.value.valueOf(), value);
        })
        .then(assertInternalBalance(feeAddress, 0))
    });
  });


  describe("Withdraw", () => {

    it('should NOT withdraw no tokens', () => {
      const sender = accounts[6];
      const value = 1000;

      return Promise.resolve()
        .then(() => deposit(sender, value))
        .then(() => asserts.throws(
            paymentGateway.withdraw(0, { from: sender, })
        ))
        .then(assertInternalBalance(sender, value))
    });

    it('should THROW on withdraw when value underflow occurs', () => {
      const sender = accounts[6];
      const value = 1000;

      return Promise.resolve()
        .then(() => deposit(sender, value))
        .then(() => balanceHolder.withdrawETH(sender, 1))
        .then(() => paymentGateway.withdraw.call(value, { from: sender, }))
        .then(resultCode => assert.equal(resultCode.toNumber(), ErrorsNamespace.PAYMENT_GATEWAY_TRANSFER_FAILED))
        .then(() => paymentGateway.withdraw(value, { from: sender, }))
        .then(assertInternalBalance(sender, value))
    });

    it('should NOT allow to withdraw more than is deposited', () => {
      const sender = accounts[6];
      const value = 1000;

      return Promise.resolve()
        .then(() => deposit(sender, value))
        .then(() => paymentGateway.withdraw.call(value + 1, { from: sender, }))
        .then(resultCode => assert.equal(resultCode.toNumber(), ErrorsNamespace.PAYMENT_GATEWAY_INSUFFICIENT_BALANCE))
        .then(() => paymentGateway.withdraw(value + 1, { from: sender, }))
        .then(assertInternalBalance(sender, value))
    });

    it("should withdraw part of the sender's tokens", () => {
      const sender = accounts[6];
      const value = 1000;
      const withdraw = 300;
      const result = 700;

      return Promise.resolve()
        .then(() => deposit(sender, value))
        .then(() => paymentGateway.withdraw(withdraw, { from: sender, }))
        .then(assertInternalBalance(sender, result))
    });

    it("should withdraw all of the sender's tokens", () => {
      const sender = accounts[6];
      const value = 1000;

      return Promise.resolve()
        .then(() => deposit(sender, value))
        .then(() => paymentGateway.withdraw(value, { from: sender, }))
        .then(assertInternalBalance(sender, 0))
    });

    it('should emit Withdrawn event in MultiEventsHistory', () => {
      const sender = accounts[6];
      const value = 1000;
      const withdraw = 300;
      const result = 700;

      return Promise.resolve()
        .then(() => deposit(sender, value))
        .then(() => paymentGateway.withdraw(withdraw, { from: sender, }))
        .then(tx => eventsHelper.extractEvents(tx, "Withdrawn"))
        .then(events => {
          assert.equal(events.length, 1);
          assert.equal(events[0].address, multiEventsHistory.address);
          assert.equal(events[0].event, 'Withdrawn');
          assert.equal(events[0].args.by, sender);
          assert.equal(events[0].args.value.valueOf(), withdraw);
        });
    });
  });

});
