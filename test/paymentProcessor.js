"use strict";

const Mock = artifacts.require('./Mock.sol');
const PaymentGatewayInterface = artifacts.require('./PaymentGatewayInterface.sol');
const PaymentProcessor = artifacts.require('./PaymentProcessor.sol');
const Roles2LibraryInterface = artifacts.require('./Roles2LibraryInterface.sol');
const Roles2Library = artifacts.require('./Roles2Library.sol');

const Asserts = require('./helpers/asserts');
const Promise = require('bluebird');
const Reverter = require('./helpers/reverter');
const ErrorsNamespace = require('../common/errors')


contract('PaymentProcessor', function(accounts) {
  const reverter = new Reverter(web3);
  afterEach('revert', reverter.revert);

  const asserts = Asserts(assert);
  const JobControllerRole = 35;
  let paymentGateway = web3.eth.contract(PaymentGatewayInterface.abi).at('0x0');
  let mock;
  let paymentProcessor;
  let jobControllerAddress = accounts[5];
  let roles2LibraryInterface = web3.eth.contract(Roles2LibraryInterface.abi).at('0x0');

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
      .then(() => PaymentProcessor.deployed())
      .then(instance => paymentProcessor = instance)
      .then(() => paymentProcessor.setPaymentGateway(mock.address))
      .then(() => Roles2Library.deployed())
      .then(rolesLibrary => rolesLibrary.addUserRole(jobControllerAddress, JobControllerRole))
      .then(reverter.snapshot);
  });

  it('should check auth on setup payment gateway', () => {
    const caller = accounts[1];
    const newAddress = '0xffffffffffffffffffffffffffffffffffffffff';

    return Promise.resolve()
      .then(() => paymentProcessor.setRoles2Library(mock.address))
      .then(() => mock.expect(
        paymentProcessor.address,
        0,
        roles2LibraryInterface.canCall.getData(
          caller,
          paymentProcessor.address,
          paymentProcessor.contract.setPaymentGateway.getData(newAddress).slice(0, 10)
        ), 0)
      )
      .then(() => paymentProcessor.setPaymentGateway(newAddress, {from: caller}))
      .then(assertExpectations());
  });

  it('should call transferWithFee on lockPayment', () => {
    const payer = '0xffffffffffffffffffffffffffffffffffffffff';
    const value = '0xffff';
    const operationId = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00';
    const addressOperationId = '0xffffffffffffffffffffffffffffffffffffff00';
    
    return Promise.resolve()
      .then(() => mock.expect(
        paymentProcessor.address,
        value,
        paymentGateway.transferWithFee.getData(
          payer, addressOperationId, 0, 0,
        ),
        1
      ))
      .then(() => paymentProcessor.lockPayment(
        operationId, payer, 
        { from: jobControllerAddress, value: value, }
      ))
      .then(assertExpectations());
  });

  it('should check auth on lockPayment call', () => {
    const caller = accounts[0];
    const payer = '0xffffffffffffffffffffffffffffffffffffffff';
    const value = '0xffff';
    const operationId = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00';
    
    return Promise.resolve()
      .then(() => paymentProcessor.setRoles2Library(mock.address))
      .then(() => mock.expect(
        paymentProcessor.address,
        0,
        roles2LibraryInterface.canCall.getData(
          caller,
          paymentProcessor.address,
          paymentProcessor.contract.lockPayment.getData(operationId, payer).slice(0, 10)
        ), 
        0
      ))
      .then(() => paymentProcessor.lockPayment(operationId, payer, { from: caller, value: value, }))
      .then(assertExpectations());
  });

  it('should call transferAll on releasePayment', () => {
    const receiver = accounts[1];
    const change = accounts[2];
    const value = '0xffff';
    const feeFromValue = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000';
    const additionalFee = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffff000000';
    const operationId = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00';
    const addressOperationId = '0xffffffffffffffffffffffffffffffffffffff00';

    return Promise.resolve()
      .then(() => mock.expect(
        paymentProcessor.address, 
        0, 
        paymentGateway.transferAll.getData(
          addressOperationId, receiver, value, change, feeFromValue, additionalFee),
          1
        )
      )
      .then(() => paymentProcessor.releasePayment(
        operationId, receiver, value, change, feeFromValue, additionalFee, 
        { from: jobControllerAddress, }))
      .then(assertExpectations());
  });

  it('should check auth on releasePayment call', () => {
    const caller = accounts[0];
    const receiver = accounts[1];
    const change = accounts[2];
    const value = '0xffff';
    const feeFromValue = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000';
    const additionalFee = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffff000000';
    const operationId = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00';
    const addressOperationId = '0xffffffffffffffffffffffffffffffffffffff00';
    return Promise.resolve()
    .then(() => paymentProcessor.setRoles2Library(mock.address))
    .then(() => mock.expect(
      paymentProcessor.address,
      0,
      roles2LibraryInterface.canCall.getData(
        caller,
        paymentProcessor.address,
        paymentProcessor.contract.releasePayment.getData(0,0,0,0,0,0).slice(0, 10)
      ), 0)
    )
    .then(() => paymentProcessor.releasePayment(
      operationId, receiver, value, change, feeFromValue, additionalFee,
      { from: caller, }
    ))
    .then(assertExpectations());
  });

  it('should return transferWithFee fail on lockPayment', async () => {
    const payer = '0xffffffffffffffffffffffffffffffffffffffff';
    const value = '0xffff';
    const operationId = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00';
    const addressOperationId = '0xffffffffffffffffffffffffffffffffffffff00';
    const result = await mock.convertUIntToBytes32(ErrorsNamespace.UNAUTHORIZED)
    
    return Promise.resolve()
      .then(() => mock.expect(
        paymentProcessor.address, 
        value, 
        paymentGateway.transferWithFee.getData(
          payer, addressOperationId, 0, 0
        ), 
        result
      ))
      .then(() => paymentProcessor.lockPayment.call(
        operationId, payer, 
        { from: jobControllerAddress, value: value, }
      ))
      .then(code => assert.equal(code.toNumber(), ErrorsNamespace.UNAUTHORIZED))
  });

  it('should return transferWithFee success on lockPayment', async () => {
    const payer = '0xffffffffffffffffffffffffffffffffffffffff';
    const value = '0xffff';
    const operationId = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00';
    const addressOperationId = '0xffffffffffffffffffffffffffffffffffffff00';
    const result = await mock.convertUIntToBytes32(ErrorsNamespace.OK)
    
    return Promise.resolve()
      .then(() => mock.expect(
        paymentProcessor.address, 
        value, 
        paymentGateway.transferWithFee.getData(
          payer, addressOperationId, 0, 0
        ), 
        result
      ))
      .then(() => paymentProcessor.lockPayment.call(
        operationId, payer,
        { from: jobControllerAddress, value: value, }
      ))
      .then(code => assert.equal(code.toNumber(), ErrorsNamespace.OK))
  });

  it('should return transferAll fail on releasePayment', async () => {
    const receiver = accounts[1];
    const change = accounts[2];
    const value = '0xffff';
    const feeFromValue = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000';
    const additionalFee = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffff000000';
    const operationId = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00';
    const addressOperationId = '0xffffffffffffffffffffffffffffffffffffff00';
    const result = await mock.convertUIntToBytes32(ErrorsNamespace.UNAUTHORIZED)

    return Promise.resolve()
      .then(() => mock.expect(
        paymentProcessor.address, 
        0, 
        paymentGateway.transferAll.getData(
          addressOperationId, receiver, value, change, feeFromValue, additionalFee
        ), 
        result
      ))
      .then(() => paymentProcessor.releasePayment.call(
        operationId, receiver, value, change, feeFromValue, additionalFee, 
        { from: jobControllerAddress, }
      ))
      .then(code => assert.equal(code.toNumber(), ErrorsNamespace.UNAUTHORIZED))
  });

  it('should return transferAll success on releasePayment', async () => {
    const receiver = accounts[1];
    const change = accounts[2];
    const value = '0xffff';
    const feeFromValue = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000';
    const additionalFee = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffff000000';
    const operationId = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00';
    const addressOperationId = '0xffffffffffffffffffffffffffffffffffffff00';
    const result = await mock.convertUIntToBytes32(ErrorsNamespace.OK)

    return Promise.resolve()
      .then(() => mock.expect(
        paymentProcessor.address, 
        0, 
        paymentGateway.transferAll.getData(
          addressOperationId, receiver, value, change, feeFromValue, additionalFee
        ), 
        result
      ))
      .then(() => paymentProcessor.releasePayment.call(
        operationId, receiver, value, change, feeFromValue, additionalFee,
        { from: jobControllerAddress, }))
      .then(code => assert.equal(code.toNumber(), ErrorsNamespace.OK))
  });

  it('should NOT call transferWithFee on lockPayment if serviceMode is enabled', () => {
    const payer = '0xffffffffffffffffffffffffffffffffffffffff';
    const value = '0xffff';
    const operationId = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00';

    return Promise.resolve()
      .then(() => paymentProcessor.enableServiceMode())
      .then(() => paymentProcessor.lockPayment(
        operationId, payer,
        { from: jobControllerAddress, value: value, }))
      .then(assertExpectations());
  });

  it('should check auth on approve call', () => {
    const caller = accounts[5];
    const operationId = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00';

    return Promise.resolve()
      .then(() => paymentProcessor.setRoles2Library(mock.address))
      .then(() => mock.expect(
        paymentProcessor.address,
        0,
        roles2LibraryInterface.canCall.getData(
          caller,
          paymentProcessor.address,
          paymentProcessor.contract.approve.getData(operationId).slice(0, 10)
        ), 0)
      )
      .then(() => paymentProcessor.approve(operationId, { from: caller, }))
      .then(assertExpectations());
  });

  it('should call transferWithFee on lockPayment if serviceMode is enabled and operation is approved', () => {
    const payer = '0xffffffffffffffffffffffffffffffffffffffff';
    const value = '0xffff';
    const operationId = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00';
    const addressOperationId = '0xffffffffffffffffffffffffffffffffffffff00';

    return Promise.resolve()
      .then(() => paymentProcessor.enableServiceMode())
      .then(() => paymentProcessor.approve(operationId))
      .then(() => mock.expect(
        paymentProcessor.address, 
        value, 
        paymentGateway.transferWithFee.getData(
          payer, addressOperationId, 0, 0,
        ), 
        1
      ))
      .then(() => paymentProcessor.lockPayment(
        operationId, payer,
        { from: jobControllerAddress, value: value, }))
      .then(assertExpectations())
      .then(() => paymentProcessor.approved(operationId))
      .then(asserts.isFalse);
  });

  it('should NOT call transferAll on releasePayment if serviceMode is enabled', () => {
    const receiver = accounts[1];
    const change = accounts[2];
    const value = '0xffff';
    const feeFromValue = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000';
    const additionalFee = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffff000000';
    const operationId = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00';
    const addressOperationId = '0xffffffffffffffffffffffffffffffffffffff00';

    return Promise.resolve()
      .then(() => paymentProcessor.enableServiceMode())
      .then(() => paymentProcessor.releasePayment(
        operationId, receiver, value, change, feeFromValue, additionalFee,
        { from: jobControllerAddress, }))
      .then(assertExpectations());
  });

  it('should call transferAll on releasePayment if serviceMode is enabled and operation is approved', () => {
    const receiver = accounts[1];
    const change = accounts[2];
    const value = '0xffff';
    const feeFromValue = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000';
    const additionalFee = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffff000000';
    const operationId = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00';
    const addressOperationId = '0xffffffffffffffffffffffffffffffffffffff00';

    return Promise.resolve()
      .then(() => paymentProcessor.enableServiceMode())
      .then(() => paymentProcessor.approve(operationId))
      .then(() => mock.expect(
        paymentProcessor.address, 
        0, 
        paymentGateway.transferAll.getData(
          addressOperationId, receiver, value, change, feeFromValue, additionalFee,
        ), 
        1
      ))
      .then(() => paymentProcessor.releasePayment(
        operationId, receiver, value, change, feeFromValue, additionalFee, 
        { from: jobControllerAddress, }))
      .then(assertExpectations())
      .then(() => paymentProcessor.approved(operationId))
      .then(asserts.isFalse);
  });

  it('should call transferWithFee on lockPayment if serviceMode is disabled', () => {
    const payer = '0xffffffffffffffffffffffffffffffffffffffff';
    const value = '0xffff';
    const operationId = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00';
    const addressOperationId = '0xffffffffffffffffffffffffffffffffffffff00';

    return Promise.resolve()
      .then(() => paymentProcessor.enableServiceMode())
      .then(() => paymentProcessor.disableServiceMode())
      .then(() => mock.expect(
        paymentProcessor.address, 
        value,
        paymentGateway.transferWithFee.getData(
          payer, addressOperationId, 0, 0,
        ), 
        1
      ))
      .then(() => paymentProcessor.lockPayment(
        operationId, payer,
        { from: jobControllerAddress, value: value, }))
      .then(assertExpectations());
  });

  it('should call transferAll on releasePayment if serviceMode is disabled', () => {
    const receiver = accounts[1];
    const change = accounts[2];
    const value = '0xffff';
    const feeFromValue = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000';
    const additionalFee = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffff000000';
    const operationId = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00';
    const addressOperationId = '0xffffffffffffffffffffffffffffffffffffff00';

    return Promise.resolve()
      .then(() => paymentProcessor.enableServiceMode())
      .then(() => paymentProcessor.disableServiceMode())
      .then(() => mock.expect(
        paymentProcessor.address, 
        0, 
        paymentGateway.transferAll.getData(
          addressOperationId, receiver, value, change, feeFromValue, additionalFee,
        ), 
        1
      ))
      .then(() => paymentProcessor.releasePayment(
        operationId, receiver, value, change, feeFromValue, additionalFee, 
        { from: jobControllerAddress, }))
      .then(assertExpectations());
  });

  it('should allow to enable service mode', () => {
    return Promise.resolve()
    .then(() => paymentProcessor.enableServiceMode())
    .then(() => paymentProcessor.serviceMode())
    .then(asserts.isTrue);
  });

  it('should allow to disable service mode', () => {
    return Promise.resolve()
    .then(() => paymentProcessor.enableServiceMode())
    .then(() => paymentProcessor.disableServiceMode())
    .then(() => paymentProcessor.serviceMode())
    .then(asserts.isFalse);
  });

  it('should not allow to enable service mode if called not by owner', () => {
    const notOwner = accounts[1];
    return Promise.resolve()
    .then(() => paymentProcessor.setRoles2Library(mock.address))
    .then(() => mock.expect(
      paymentProcessor.address,
      0,
      roles2LibraryInterface.canCall.getData(
        notOwner,
        paymentProcessor.address,
        paymentProcessor.contract.enableServiceMode.getData().slice(0, 10)
      ), 0)
    )
    .then(() => paymentProcessor.enableServiceMode({from: notOwner}))
    .then(assertExpectations())
    .then(() => paymentProcessor.serviceMode())
    .then(asserts.isFalse);
  });

  it('should not allow to disable service mode if called not by owner', () => {
    const notOwner = accounts[1];
    return Promise.resolve()
    .then(() => paymentProcessor.enableServiceMode())
    .then(() => paymentProcessor.setRoles2Library(mock.address))
    .then(() => mock.expect(
      paymentProcessor.address,
      0,
      roles2LibraryInterface.canCall.getData(
        notOwner,
        paymentProcessor.address,
        paymentProcessor.contract.disableServiceMode.getData().slice(0, 10)
      ), 0)
    )
    .then(() => paymentProcessor.disableServiceMode({from: notOwner}))
    .then(assertExpectations())
    .then(() => paymentProcessor.serviceMode())
    .then(asserts.isTrue);
  });

});
