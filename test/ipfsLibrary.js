const Reverter = require('./helpers/reverter');
const Asserts = require('./helpers/asserts');
const Storage = artifacts.require('./Storage.sol');
const ManagerMock = artifacts.require('./ManagerMock.sol');
const IPFSLibrary = artifacts.require('./IPFSLibrary.sol');
const EventsHistory = artifacts.require('./EventsHistory.sol');

contract('IPFSLibrary', function(accounts) {
  const reverter = new Reverter(web3);
  afterEach('revert', reverter.revert);

  const asserts = Asserts(assert);
  const SENDER = accounts[1];
  let storage;
  let eventsHistory;
  let ipfsLibrary;

  before('setup', () => {
    return Storage.deployed()
    .then(instance => storage = instance)
    .then(() => ManagerMock.deployed())
    .then(instance => storage.setManager(instance.address))
    .then(() => IPFSLibrary.deployed())
    .then(instance => ipfsLibrary = instance)
    .then(() => EventsHistory.deployed())
    .then(instance => eventsHistory = instance)
    .then(() => ipfsLibrary.setupEventsHistory(eventsHistory.address))
    .then(() => eventsHistory.addVersion(ipfsLibrary.address, '_', '_'))
    .then(reverter.snapshot);
  });

  it('should be able to set hash', () => {
    const hash = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const key = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00';
    return ipfsLibrary.setHash(key, hash, {from: SENDER})
    .then(() => ipfsLibrary.getHash(SENDER, key))
    .then(asserts.equal(hash));
  });

  it('should rewrite hash', () => {
    const hash1 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const hash2 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00ff';
    const key = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00';
    return ipfsLibrary.setHash(key, hash1, {from: SENDER})
    .then(() => ipfsLibrary.setHash(key, hash2, {from: SENDER}))
    .then(() => ipfsLibrary.getHash(SENDER, key))
    .then(asserts.equal(hash2));
  });

  it('should store hashes for different keys', () => {
    const hash1 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const hash2 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00ff';
    const key1 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00';
    const key2 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000';
    return ipfsLibrary.setHash(key1, hash1, {from: SENDER})
    .then(() => ipfsLibrary.setHash(key2, hash2, {from: SENDER}))
    .then(() => ipfsLibrary.getHash(SENDER, key1))
    .then(asserts.equal(hash1))
    .then(() => ipfsLibrary.getHash(SENDER, key2))
    .then(asserts.equal(hash2));
  });

  it('should store hashes from different setters', () => {
    const sender2 = accounts[3];
    const hash1 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const hash2 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00ff';
    const key = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00';
    return ipfsLibrary.setHash(key, hash1, {from: SENDER})
    .then(() => ipfsLibrary.setHash(key, hash2, {from: sender2}))
    .then(() => ipfsLibrary.getHash(SENDER, key))
    .then(asserts.equal(hash1))
    .then(() => ipfsLibrary.getHash(sender2, key))
    .then(asserts.equal(hash2));
  });

  it('should emit "HashSet" event when hash set', () => {
    const hash = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const key = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00';
    return ipfsLibrary.setHash(key, hash, {from: SENDER})
    .then(result => {
      assert.equal(result.logs.length, 1);
      assert.equal(result.logs[0].address, eventsHistory.address);
      assert.equal(result.logs[0].event, 'HashSet');
      assert.equal(result.logs[0].args.setter, SENDER);
      assert.equal(result.logs[0].args.key, key);
      assert.equal(result.logs[0].args.hash, hash);
    });
  });
});
