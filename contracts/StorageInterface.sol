/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 */

pragma solidity ^0.4.23;


import "./Storage.sol";


library StorageInterface {

    struct Config {
        Storage store;
        bytes32 crate;
    }

    struct UInt {
        bytes32 id;
    }

    struct UInt8 {
        bytes32 id;
    }

    struct Int {
        bytes32 id;
    }

    struct Address {
        bytes32 id;
    }

    struct Bool {
        bytes32 id;
    }

    struct Bytes32 {
        bytes32 id;
    }

    struct Mapping {
        bytes32 id;
    }

    struct AddressBoolMapping {
        Mapping innerMapping;
    }

    struct UintAddressBoolMapping {
        Mapping innerMapping;
    }

    struct AddressBytes32Mapping {
        Mapping innerMapping;
    }

    struct AddressUInt8Mapping {
        bytes32 id;
    }

    struct AddressUIntMapping {
        Mapping innerMapping;
    }

    struct AddressUIntUInt8Mapping {
        Mapping innerMapping;
    }

    struct UIntUIntBoolMapping {
        Mapping innerMapping;
    }

    struct AddressBytes4BoolMapping {
        Mapping innerMapping;
    }

    struct AddressBytes4Bytes32Mapping {
        Mapping innerMapping;
    }

    struct AddressUIntUIntMapping {
        Mapping innerMapping;
    }

    struct AddressUIntUIntUIntMapping {
        Mapping innerMapping;
    }

    struct AddressAddressUIntMapping {
        Mapping innerMapping;
    }

    struct AddressAddressUInt8Mapping {
        Mapping innerMapping;
    }

    struct AddressBytes32Bytes32Mapping {
        Mapping innerMapping;
    }

    struct UIntAddressMapping {
        Mapping innerMapping;
    }

    struct UIntAddressAddressMapping {
        Mapping innerMapping;
    }

    struct UIntAddressUIntMapping {
        Mapping innerMapping;
    }

    struct UIntBoolMapping {
        Mapping innerMapping;
    }

    struct UIntUIntMapping {
        Mapping innerMapping;
    }

    struct UIntEnumMapping {
        Mapping innerMapping;
    }

    struct AddressUIntStructAddressUInt8Mapping {
        AddressUInt8Mapping innerMapping;
    }

    struct AddressUIntUIntStructAddressUInt8Mapping {
        AddressUInt8Mapping innerMapping;
    }

    struct AddressUIntUIntUIntStructAddressUInt8Mapping {
        AddressUInt8Mapping innerMapping;
    }

    struct AddressUIntUIntUIntUIntStructAddressUInt8Mapping {
        AddressUInt8Mapping innerMapping;
    }

    struct AddressUIntAddressUInt8Mapping {
        Mapping innerMapping;
    }

    struct AddressUIntUIntAddressUInt8Mapping {
        Mapping innerMapping;
    }

    struct AddressUIntUIntUIntAddressUInt8Mapping {
        Mapping innerMapping;
    }

    struct UIntBytes32Mapping {
        Mapping innerMapping;
    }

    struct UIntUIntBytes32Mapping {
        Mapping innerMapping;
    }

    struct UIntUIntUIntBytes32Mapping {
        Mapping innerMapping;
    }

    struct Bytes32AddressMapping {
        Mapping innerMapping;
    }

    bytes32 constant SET_IDENTIFIER = "set";

    struct Set {
        UInt count;
        Mapping indexes;
        Mapping values;
    }

    struct AddressesSet {
        Set innerSet;
    }

    struct Bytes32SetMapping {
        Set innerMapping;
    }

    struct AddressesSetMapping {
        Bytes32SetMapping innerMapping;
    }

    struct UIntSetMapping {
        Bytes32SetMapping innerMapping;
    }

    // Can't use modifier due to a Solidity bug.
    function sanityCheck(bytes32 _currentId, bytes32 _newId) internal pure {
        if (_currentId != 0 || _newId == 0) {
            revert();
        }
    }

    function init(Config storage self, Storage _store, bytes32 _crate) internal {
        self.store = _store;
        self.crate = _crate;
    }

    function init(UInt storage self, bytes32 _id) internal {
        sanityCheck(self.id, _id);
        self.id = _id;
    }


    function init(UInt8 storage self, bytes32 _id) internal {
        sanityCheck(self.id, _id);
        self.id = _id;
    }

    function init(Int storage self, bytes32 _id) internal {
        sanityCheck(self.id, _id);
        self.id = _id;
    }

    function init(Address storage self, bytes32 _id) internal {
        sanityCheck(self.id, _id);
        self.id = _id;
    }

    function init(Bool storage self, bytes32 _id) internal {
        sanityCheck(self.id, _id);
        self.id = _id;
    }

    function init(Bytes32 storage self, bytes32 _id) internal {
        sanityCheck(self.id, _id);
        self.id = _id;
    }

    function init(Mapping storage self, bytes32 _id) internal {
        sanityCheck(self.id, _id);
        self.id = _id;
    }

    function init(AddressBoolMapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(UintAddressBoolMapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(AddressBytes32Mapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(AddressUInt8Mapping storage self, bytes32 _id) internal {
        sanityCheck(self.id, _id);
        self.id = _id;
    }

    function init(AddressUIntMapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(AddressUIntUInt8Mapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(UIntUIntBoolMapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(AddressBytes4BoolMapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(AddressBytes4Bytes32Mapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(AddressUIntUIntMapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(AddressUIntUIntUIntMapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(AddressAddressUIntMapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(AddressAddressUInt8Mapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(AddressBytes32Bytes32Mapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(UIntBytes32Mapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(UIntAddressMapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(UIntAddressAddressMapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(UIntAddressUIntMapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(UIntBoolMapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(UIntUIntMapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(UIntEnumMapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(AddressUIntStructAddressUInt8Mapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(AddressUIntUIntStructAddressUInt8Mapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(AddressUIntUIntUIntStructAddressUInt8Mapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(AddressUIntUIntUIntUIntStructAddressUInt8Mapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(AddressUIntAddressUInt8Mapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(AddressUIntUIntAddressUInt8Mapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(AddressUIntUIntUIntAddressUInt8Mapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(UIntUIntBytes32Mapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(UIntUIntUIntBytes32Mapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(Set storage self, bytes32 _id) internal {
        init(self.count, keccak256(_id, "count"));
        init(self.indexes, keccak256(_id, "indexes"));
        init(self.values, keccak256(_id, "values"));
    }

    function init(AddressesSet storage self, bytes32 _id) internal {
        init(self.innerSet, _id);
    }

    function init(Bytes32AddressMapping  storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(Bytes32SetMapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(AddressesSetMapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function init(UIntSetMapping storage self, bytes32 _id) internal {
        init(self.innerMapping, _id);
    }

    function set(Config storage self, UInt storage item, uint _value) internal {
        self.store.setUInt(self.crate, item.id, _value);
    }

    function set(Config storage self, UInt storage item, bytes32 _salt, uint _value) internal {
        self.store.setUInt(self.crate, keccak256(item.id, _salt), _value);
    }

    function set(Config storage self, Int storage item, int _value) internal {
        self.store.setInt(self.crate, item.id, _value);
    }

    function set(Config storage self, Int storage item, bytes32 _salt, int _value) internal {
        self.store.setInt(self.crate, keccak256(item.id, _salt), _value);
    }

    function set(Config storage self, Address storage item, address _value) internal {
        self.store.setAddress(self.crate, item.id, _value);
    }

    function set(Config storage self, Address storage item, bytes32 _salt, address _value) internal {
        self.store.setAddress(self.crate, keccak256(item.id, _salt), _value);
    }

    function set(Config storage self, Bool storage item, bool _value) internal {
        self.store.setBool(self.crate, item.id, _value);
    }

    function set(Config storage self, Bool storage item, bytes32 _salt, bool _value) internal {
        self.store.setBool(self.crate, keccak256(item.id, _salt), _value);
    }

    function set(Config storage self, Bytes32 storage item, bytes32 _value) internal {
        self.store.setBytes32(self.crate, item.id, _value);
    }

    function set(Config storage self, Bytes32 storage item, bytes32 _salt, bytes32 _value) internal {
        self.store.setBytes32(self.crate, keccak256(item.id, _salt), _value);
    }

    function set(Config storage self, Mapping storage item, uint _key, uint _value) internal {
        self.store.setUInt(self.crate, keccak256(item.id, _key), _value);
    }

    function set(Config storage self, Mapping storage item, bytes32 _key, bytes32 _value) internal {
        self.store.setBytes32(self.crate, keccak256(item.id, _key), _value);
    }

    function set(Config storage self, Mapping storage item, bytes32 _key, bytes32 _key2, bytes32 _value) internal {
        set(self, item, keccak256(_key, _key2), _value);
    }

    function set(Config storage self, Mapping storage item, bytes32 _key, bytes32 _key2, bytes32 _key3, bytes32 _value) internal {
        set(self, item, keccak256(_key, _key2, _key3), _value);
    }

    function set(Config storage self, AddressUInt8Mapping storage item, bytes32 _key, address _value1, uint8 _value2) internal {
        self.store.setAddressUInt8(self.crate, keccak256(item.id, _key), _value1, _value2);
    }

    function set(Config storage self, AddressBoolMapping storage item, address _key, bool _value) internal {
        set(self, item.innerMapping, bytes32(_key), toBytes32(_value));
    }

    function set(Config storage self, UintAddressBoolMapping storage item, uint _key, address _key2, bool _value) internal {
        set(self, item.innerMapping, bytes32(_key), bytes32(_key2), toBytes32(_value));
    }

    function set(Config storage self, AddressBytes32Mapping storage item, address _key, bytes32 _value) internal {
        set(self, item.innerMapping, bytes32(_key), _value);
    }

    function set(Config storage self, AddressUIntMapping storage item, address _key, uint _value) internal {
        set(self, item.innerMapping, bytes32(_key), bytes32(_value));
    }

    function set(Config storage self, AddressUIntUInt8Mapping storage item, address _key, uint _key2, uint8 _value) internal {
        set(self, item.innerMapping, bytes32(_key), bytes32(_key2), bytes32(_value));
    }

    function set(Config storage self, UIntUIntBoolMapping storage item, uint _key, uint _key2, bool _value) internal {
        set(self, item.innerMapping, bytes32(_key), bytes32(_key2), toBytes32(_value));
    }

    function set(Config storage self, AddressBytes4BoolMapping storage item, address _key, bytes4 _key2, bool _value) internal {
        set(self, item.innerMapping, bytes32(_key), bytes32(_key2), toBytes32(_value));
    }

    function set(Config storage self, AddressBytes4Bytes32Mapping storage item, address _key, bytes4 _key2, bytes32 _value) internal {
        set(self, item.innerMapping, bytes32(_key), bytes32(_key2), _value);
    }

    function set(Config storage self, AddressUIntUIntMapping storage item, address _key, uint _key2, uint _value) internal {
        set(self, item.innerMapping, bytes32(_key), bytes32(_key2), bytes32(_value));
    }

    function set(Config storage self, AddressUIntUIntUIntMapping storage item, address _key, uint _key2, uint _key3, uint _value) internal {
        set(self, item.innerMapping, bytes32(_key), bytes32(_key2), bytes32(_key3), bytes32(_value));
    }

    function set(Config storage self, AddressAddressUIntMapping storage item, address _key, address _key2, uint _value) internal {
        set(self, item.innerMapping, bytes32(_key), bytes32(_key2), bytes32(_value));
    }

    function set(Config storage self, AddressAddressUInt8Mapping storage item, address _key, address _key2, uint8 _value) internal {
        set(self, item.innerMapping, bytes32(_key), bytes32(_key2), bytes32(_value));
    }

    function set(Config storage self, AddressBytes32Bytes32Mapping storage item, address _key, bytes32 _key2, bytes32 _value) internal {
        set(self, item.innerMapping, bytes32(_key), _key2, _value);
    }

    function set(Config storage self, UIntBytes32Mapping storage item, uint _key, bytes32 _value) internal {
        set(self, item.innerMapping, bytes32(_key), _value);
    }

    function set(Config storage self, UIntAddressMapping storage item, uint _key, address _value) internal {
        set(self, item.innerMapping, bytes32(_key), bytes32(_value));
    }

    function set(Config storage self, UIntBoolMapping storage item, uint _key, bool _value) internal {
        set(self, item.innerMapping, bytes32(_key), toBytes32(_value));
    }

    function set(Config storage self, UIntAddressAddressMapping storage item, uint _key, address _key2, address _value) internal {
        set(self, item.innerMapping, bytes32(_key), bytes32(_key2), bytes32(_value));
    }

    function set(Config storage self, UIntAddressUIntMapping storage item, uint _key, address _key2, uint _value) internal {
        set(self, item.innerMapping, bytes32(_key), bytes32(_key2), bytes32(_value));
    }

    function set(Config storage self, UIntUIntMapping storage item, uint _key, uint _value) internal {
        set(self, item.innerMapping, bytes32(_key), bytes32(_value));
    }

    function set(Config storage self, UIntEnumMapping storage item, uint _key, uint8 _value) internal {
        set(self, item.innerMapping, bytes32(_key), bytes32(_value));
    }

    function set(Config storage self, AddressUIntStructAddressUInt8Mapping storage item, address _key, uint _key2, address _value, uint8 _value2) internal {
        set(self, item.innerMapping, keccak256(_key, _key2), _value, _value2);
    }

    function set(Config storage self, AddressUIntUIntStructAddressUInt8Mapping storage item, address _key, uint _key2, uint _key3, address _value, uint8 _value2) internal {
        set(self, item.innerMapping, keccak256(_key, _key2, _key3), _value, _value2);
    }

    function set(Config storage self, AddressUIntUIntUIntStructAddressUInt8Mapping storage item, address _key, uint _key2, uint _key3, uint _key4, address _value, uint8 _value2) internal {
        set(self, item.innerMapping, keccak256(_key, _key2, _key3, _key4), _value, _value2);
    }

    function set(Config storage self, AddressUIntUIntUIntUIntStructAddressUInt8Mapping storage item, address _key, uint _key2, uint _key3, uint _key4, uint _key5, address _value, uint8 _value2) internal {
        set(self, item.innerMapping, keccak256(_key, _key2, _key3, _key4, _key5), _value, _value2);
    }

    function set(Config storage self, AddressUIntAddressUInt8Mapping storage item, address _key, uint _key2, address _key3, uint8 _value) internal {
        set(self, item.innerMapping, keccak256(_key, _key2, _key3), bytes32(_value));
    }

    function set(Config storage self, AddressUIntUIntAddressUInt8Mapping storage item, address _key, uint _key2, uint _key3, address _key4, uint8 _value) internal {
        set(self, item.innerMapping, keccak256(_key, _key2, _key3, _key4), bytes32(_value));
    }

    function set(Config storage self, AddressUIntUIntUIntAddressUInt8Mapping storage item, address _key, uint _key2, uint _key3, uint _key4, address _key5, uint8 _value) internal {
        set(self, item.innerMapping, keccak256(_key, _key2, _key3, _key4, _key5), bytes32(_value));
    }

    function set(Config storage self, UIntUIntBytes32Mapping storage item, uint _key, uint _key2, bytes32 _value) internal {
        set(self, item.innerMapping, bytes32(_key), bytes32(_key2), _value);
    }

    function set(Config storage self, UIntUIntUIntBytes32Mapping storage item, uint _key, uint _key2, uint _key3, bytes32 _value) internal {
        set(self, item.innerMapping, bytes32(_key), bytes32(_key2), bytes32(_key3), _value);
    }

    function set(Config storage self, Bytes32AddressMapping storage item, bytes32 _key, address _value) internal {
        set(self, item.innerMapping, _key, bytes32(_value));
    }

    function add(Config storage self, Set storage item, bytes32 _value) internal {
        add(self, item, SET_IDENTIFIER, _value);
    }

    function add(Config storage self, Set storage item, bytes32 _salt, bytes32 _value) private {
        if (includes(self, item, _salt, _value)) {
            return;
        }
        uint newCount = count(self, item, _salt) + 1;
        set(self, item.values, _salt, bytes32(newCount), _value);
        set(self, item.indexes, _salt, _value, bytes32(newCount));
        set(self, item.count, _salt, newCount);
    }

    function add(Config storage self, AddressesSet storage item, address _value) internal {
        add(self, item.innerSet, bytes32(_value));
    }

    function add(Config storage self, Bytes32SetMapping storage item, bytes32 _key, bytes32 _value) internal {
        add(self, item.innerMapping, _key, _value);
    }

    function add(Config storage self, AddressesSetMapping storage item, bytes32 _key, address _value) internal {
        add(self, item.innerMapping, _key, bytes32(_value));
    }

    function add(Config storage self, UIntSetMapping storage item, bytes32 _key, uint _value) internal {
        add(self, item.innerMapping, _key, bytes32(_value));
    }

    function remove(Config storage self, Set storage item, bytes32 _value) internal {
        remove(self, item, SET_IDENTIFIER, _value);
    }

    function remove(Config storage self, Set storage item, bytes32 _salt, bytes32 _value) private {
        if (!includes(self, item, _salt, _value)) {
            return;
        }
        uint lastIndex = count(self, item, _salt);
        bytes32 lastValue = get(self, item.values, _salt, bytes32(lastIndex));
        uint index = uint(get(self, item.indexes, _salt, _value));
        if (index < lastIndex) {
            set(self, item.indexes, _salt, lastValue, bytes32(index));
            set(self, item.values, _salt, bytes32(index), lastValue);
        }
        set(self, item.indexes, _salt, _value, bytes32(0));
        set(self, item.values, _salt, bytes32(lastIndex), bytes32(0));
        set(self, item.count, _salt, lastIndex - 1);
    }

    function remove(Config storage self, AddressesSet storage item, address _value) internal {
        remove(self, item.innerSet, bytes32(_value));
    }

    function remove(Config storage self, Bytes32SetMapping storage item, bytes32 _key, bytes32 _value) internal {
        remove(self, item.innerMapping, _key, _value);
    }

    function remove(Config storage self, AddressesSetMapping storage item, bytes32 _key, address _value) internal {
        remove(self, item.innerMapping, _key, bytes32(_value));
    }

    function remove(Config storage self, UIntSetMapping storage item, bytes32 _key, uint _value) internal {
        remove(self, item.innerMapping, _key, bytes32(_value));
    }

    /** `get` operation */

    function get(Config storage self, UInt storage item) internal view returns (uint) {
        return self.store.getUInt(self.crate, item.id);
    }

    function get(Config storage self, UInt storage item, bytes32 salt) internal view returns (uint) {
        return self.store.getUInt(self.crate, keccak256(item.id, salt));
    }

    function get(Config storage self, Int storage item) internal view returns (int) {
        return self.store.getInt(self.crate, item.id);
    }

    function get(Config storage self, Int storage item, bytes32 salt) internal view returns (int) {
        return self.store.getInt(self.crate, keccak256(item.id, salt));
    }

    function get(Config storage self, Address storage item) internal view returns (address) {
        return self.store.getAddress(self.crate, item.id);
    }

    function get(Config storage self, Address storage item, bytes32 salt) internal view returns (address) {
        return self.store.getAddress(self.crate, keccak256(item.id, salt));
    }

    function get(Config storage self, Bool storage item) internal view returns (bool) {
        return self.store.getBool(self.crate, item.id);
    }

    function get(Config storage self, Bool storage item, bytes32 salt) internal view returns (bool) {
        return self.store.getBool(self.crate, keccak256(item.id, salt));
    }

    function get(Config storage self, Bytes32 storage item) internal view returns (bytes32) {
        return self.store.getBytes32(self.crate, item.id);
    }

    function get(Config storage self, Bytes32 storage item, bytes32 salt) internal view returns (bytes32) {
        return self.store.getBytes32(self.crate, keccak256(item.id, salt));
    }

    function get(Config storage self, Mapping storage item, uint _key) internal view returns (uint) {
        return self.store.getUInt(self.crate, keccak256(item.id, _key));
    }

    function get(Config storage self, Mapping storage item, bytes32 _key) internal view returns (bytes32) {
        return self.store.getBytes32(self.crate, keccak256(item.id, _key));
    }

    function get(Config storage self, Mapping storage item, bytes32 _key, bytes32 _key2) internal view returns (bytes32) {
        return get(self, item, keccak256(_key, _key2));
    }

    function get(Config storage self, Mapping storage item, bytes32 _key, bytes32 _key2, bytes32 _key3) internal view returns (bytes32) {
        return get(self, item, keccak256(_key, _key2, _key3));
    }

    function get(Config storage self, AddressUInt8Mapping storage item, bytes32 _key) internal view returns (address, uint8) {
        return self.store.getAddressUInt8(self.crate, keccak256(item.id, _key));
    }

    function get(Config storage self, AddressBoolMapping storage item, address _key) internal view returns (bool) {
        return toBool(get(self, item.innerMapping, bytes32(_key)));
    }

    function get(Config storage self, UintAddressBoolMapping storage item, uint _key, address _key2) internal view returns (bool) {
        return toBool(get(self, item.innerMapping, bytes32(_key), bytes32(_key2)));
    }

    function get(Config storage self, AddressBytes32Mapping storage item, address _key) internal view returns (bytes32) {
        return get(self, item.innerMapping, bytes32(_key));
    }

    function get(Config storage self, AddressUIntMapping storage item, address _key) internal view returns (uint) {
        return uint(get(self, item.innerMapping, bytes32(_key)));
    }

    function get(Config storage self, AddressUIntUInt8Mapping storage item, address _key, uint _key2) internal view returns (uint) {
        return uint8(get(self, item.innerMapping, bytes32(_key), bytes32(_key2)));
    }

    function get(Config storage self, UIntUIntBoolMapping storage item, uint _key, uint _key2) internal view returns (bool) {
        return toBool(get(self, item.innerMapping, bytes32(_key), bytes32(_key2)));
    }

    function get(Config storage self, AddressBytes4BoolMapping storage item, address _key, bytes4 _key2) internal view returns (bool) {
        return toBool(get(self, item.innerMapping, bytes32(_key), bytes32(_key2)));
    }

    function get(Config storage self, AddressBytes4Bytes32Mapping storage item, address _key, bytes4 _key2) internal view returns (bytes32) {
        return get(self, item.innerMapping, bytes32(_key), bytes32(_key2));
    }

    function get(Config storage self, AddressUIntUIntMapping storage item, address _key, uint _key2) internal view returns (uint) {
        return uint(get(self, item.innerMapping, bytes32(_key), bytes32(_key2)));
    }

    function get(Config storage self, AddressUIntUIntUIntMapping storage item, address _key, uint _key2, uint _key3) internal view returns (uint) {
        return uint(get(self, item.innerMapping, bytes32(_key), bytes32(_key2), bytes32(_key3)));
    }

    function get(Config storage self, AddressAddressUIntMapping storage item, address _key, address _key2) internal view returns (uint) {
        return uint(get(self, item.innerMapping, bytes32(_key), bytes32(_key2)));
    }

    function get(Config storage self, AddressAddressUInt8Mapping storage item, address _key, address _key2) internal view returns (uint8) {
        return uint8(get(self, item.innerMapping, bytes32(_key), bytes32(_key2)));
    }

    function get(Config storage self, AddressBytes32Bytes32Mapping storage item, address _key, bytes32 _key2) internal view returns (bytes32) {
        return get(self, item.innerMapping, bytes32(_key), _key2);
    }

    function get(Config storage self, UIntBytes32Mapping storage item, uint _key) internal view returns (bytes32) {
        return get(self, item.innerMapping, bytes32(_key));
    }

    function get(Config storage self, UIntAddressMapping storage item, uint _key) internal view returns (address) {
        return address(get(self, item.innerMapping, bytes32(_key)));
    }

    function get(Config storage self, UIntBoolMapping storage item, uint _key) internal view returns (bool) {
        return toBool(get(self, item.innerMapping, bytes32(_key)));
    }

    function get(Config storage self, UIntAddressAddressMapping storage item, uint _key, address _key2) internal view returns (address) {
        return address(get(self, item.innerMapping, bytes32(_key), bytes32(_key2)));
    }

    function get(Config storage self, UIntAddressUIntMapping storage item, uint _key, address _key2) internal view returns (uint) {
        return uint(get(self, item.innerMapping, bytes32(_key), bytes32(_key2)));
    }

    function get(Config storage self, UIntUIntMapping storage item, uint _key) internal view returns (uint) {
        return uint(get(self, item.innerMapping, bytes32(_key)));
    }

    function get(Config storage self, UIntEnumMapping storage item, uint _key) internal view returns (uint8) {
        return uint8(get(self, item.innerMapping, bytes32(_key)));
    }

    function get(Config storage self, AddressUIntStructAddressUInt8Mapping storage item, address _key, uint _key2) internal view returns (address, uint8) {
        return get(self, item.innerMapping, keccak256(_key, _key2));
    }

    function get(Config storage self, AddressUIntUIntStructAddressUInt8Mapping storage item, address _key, uint _key2, uint _key3) internal view returns (address, uint8) {
        return get(self, item.innerMapping, keccak256(_key, _key2, _key3));
    }

    function get(Config storage self, AddressUIntUIntUIntStructAddressUInt8Mapping storage item, address _key, uint _key2, uint _key3, uint _key4) internal view returns (address, uint8) {
        return get(self, item.innerMapping, keccak256(_key, _key2, _key3, _key4));
    }

    function get(Config storage self, AddressUIntUIntUIntUIntStructAddressUInt8Mapping storage item, address _key, uint _key2, uint _key3, uint _key4, uint _key5) internal view returns (address, uint8) {
        return get(self, item.innerMapping, keccak256(_key, _key2, _key3, _key4, _key5));
    }

    function get(Config storage self, AddressUIntAddressUInt8Mapping storage item, address _key, uint _key2, address _key3) internal view returns (uint8) {
        return uint8(get(self, item.innerMapping, keccak256(_key, _key2, _key3)));
    }

    function get(Config storage self, AddressUIntUIntAddressUInt8Mapping storage item, address _key, uint _key2, uint _key3, address _key4) internal view returns (uint8) {
        return uint8(get(self, item.innerMapping, keccak256(_key, _key2, _key3, _key4)));
    }

    function get(Config storage self, AddressUIntUIntUIntAddressUInt8Mapping storage item, address _key, uint _key2, uint _key3, uint _key4, address _key5) internal view returns (uint8) {
        return uint8(get(self, item.innerMapping, keccak256(_key, _key2, _key3, _key4, _key5)));
    }

    function get(Config storage self, UIntUIntBytes32Mapping storage item, uint _key, uint _key2) internal view returns (bytes32) {
        return get(self, item.innerMapping, bytes32(_key), bytes32(_key2));
    }

    function get(Config storage self, Bytes32AddressMapping storage item, bytes32 _key) internal view returns (address) {
        return address(get(self, item.innerMapping, _key));
    }

    function get(Config storage self, UIntUIntUIntBytes32Mapping storage item, uint _key, uint _key2, uint _key3) internal view returns (bytes32) {
        return get(self, item.innerMapping, bytes32(_key), bytes32(_key2), bytes32(_key3));
    }

    /** `includes` operation */

    function includes(Config storage self, Set storage item, bytes32 _value) internal view returns (bool) {
        return includes(self, item, SET_IDENTIFIER, _value);
    }

    function includes(Config storage self, Set storage item, bytes32 _salt, bytes32 _value) internal view returns (bool) {
        return get(self, item.indexes, _salt, _value) != 0;
    }

    function includes(Config storage self, AddressesSet storage item, address _value) internal view returns (bool) {
        return includes(self, item.innerSet, bytes32(_value));
    }

    function includes(Config storage self, Bytes32SetMapping storage item, bytes32 _key, bytes32 _value) internal view returns (bool) {
        return includes(self, item.innerMapping, _key, _value);
    }

    function includes(Config storage self, AddressesSetMapping storage item, bytes32 _key, address _value) internal view returns (bool) {
        return includes(self, item.innerMapping, _key, bytes32(_value));
    }

    function includes(Config storage self, UIntSetMapping storage item, bytes32 _key, uint _value) internal view returns (bool) {
        return includes(self, item.innerMapping, _key, bytes32(_value));
    }

    function getIndex(Config storage self, Set storage item, bytes32 _value) internal view returns (uint) {
        return getIndex(self, item, SET_IDENTIFIER, _value);
    }

    function getIndex(Config storage self, Set storage item, bytes32 _salt, bytes32 _value) private view returns (uint) {
        return uint(get(self, item.indexes, _salt, _value));
    }

    function getIndex(Config storage self, Bytes32SetMapping storage item, bytes32 _key, bytes32 _value) internal view returns (uint) {
        return getIndex(self, item.innerMapping, _key, _value);
    }

    function getIndex(Config storage self, AddressesSetMapping storage item, bytes32 _key, address _value) internal view returns (uint) {
        return getIndex(self, item.innerMapping, _key, bytes32(_value));
    }

    function getIndex(Config storage self, UIntSetMapping storage item, bytes32 _key, uint _value) internal view returns (uint) {
        return getIndex(self, item.innerMapping, _key, bytes32(_value));
    }

    /** `count` operation */

    function count(Config storage self, Set storage item) internal view returns (uint) {
        return count(self, item, SET_IDENTIFIER);
    }

    function count(Config storage self, Set storage item, bytes32 _salt) internal view returns (uint) {
        return get(self, item.count, _salt);
    }

    function count(Config storage self, AddressesSet storage item) internal view returns (uint) {
        return count(self, item.innerSet);
    }

    function count(Config storage self, Bytes32SetMapping storage item, bytes32 _key) internal view returns (uint) {
        return count(self, item.innerMapping, _key);
    }

    function count(Config storage self, AddressesSetMapping storage item, bytes32 _key) internal view returns (uint) {
        return count(self, item.innerMapping, _key);
    }

    function count(Config storage self, UIntSetMapping storage item, bytes32 _key) internal view returns (uint) {
        return count(self, item.innerMapping, _key);
    }

    function get(Config storage self, Set storage item) internal view returns (bytes32[] result) {
        result = get(self, item, SET_IDENTIFIER);
    }

    function get(Config storage self, Set storage item, bytes32 _salt) private view returns (bytes32[] result) {
        uint valuesCount = count(self, item, _salt);
        result = new bytes32[](valuesCount);
        for (uint i = 0; i < valuesCount; i++) {
            result[i] = get(self, item, _salt, i);
        }
    }

    function get(Config storage self, Set storage item, uint _index) internal view returns (bytes32) {
        return get(self, item, SET_IDENTIFIER, _index);
    }

    function get(Config storage self, Set storage item, bytes32 _salt, uint _index) private view returns (bytes32) {
        return get(self, item.values, _salt, bytes32(_index + 1));
    }

    function get(Config storage self, AddressesSet storage item) internal view returns (address[]) {
        return toAddresses(get(self, item.innerSet));
    }

    function get(Config storage self, AddressesSet storage item, uint _index) internal view returns (address) {
        return address(get(self, item.innerSet, _index));
    }

    function get(Config storage self, Bytes32SetMapping storage item, bytes32 _key) internal view returns (bytes32[]) {
        return get(self, item.innerMapping, _key);
    }

    function get(Config storage self, AddressesSetMapping storage item, bytes32 _key) internal view returns (address[]) {
        return toAddresses(get(self, item.innerMapping, _key));
    }

    function get(Config storage self, UIntSetMapping storage item, bytes32 _key) internal view returns (uint[]) {
        return toUInt(get(self, item.innerMapping, _key));
    }

    function get(Config storage self, Bytes32SetMapping storage item, bytes32 _key, uint _index) internal view returns (bytes32) {
        return get(self, item.innerMapping, _key, _index);
    }

    function get(Config storage self, AddressesSetMapping storage item, bytes32 _key, uint _index) internal view returns (address) {
        return address(get(self, item.innerMapping, _key, _index));
    }

    function get(Config storage self, UIntSetMapping storage item, bytes32 _key, uint _index) internal view returns (uint) {
        return uint(get(self, item.innerMapping, _key, _index));
    }

    function toBool(bytes32 self) public pure returns (bool) {
        return self != bytes32(0);
    }

    function toBytes32(bool self) public pure returns (bytes32) {
        return bytes32(self ? 1 : 0);
    }

    function toAddresses(bytes32[] memory self) public pure returns (address[]) {
        address[] memory result = new address[](self.length);
        for (uint i = 0; i < self.length; i++) {
            result[i] = address(self[i]);
        }
        return result;
    }

    function toUInt(bytes32[] memory self) public pure returns (uint[]) {
        uint[] memory result = new uint[](self.length);
        for (uint i = 0; i < self.length; i++) {
            result[i] = uint(self[i]);
        }
        return result;
    }
}
