/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 */

pragma solidity ^0.4.21;


import "solidity-storage-lib/contracts/StorageAdapter.sol";
import "./adapters/MultiEventsHistoryAdapter.sol";
import "./adapters/Roles2LibraryAdapter.sol";
import "./base/BitOps.sol";


/**
 * @title LaborX User Library.
 *
 * Skills:
 * Here we encode 128 different areas, each with 128 different categories
 * each with 256 different skills, using bit flags starting from the right,
 * for every user.
 * Areas and categories use odd bit flags to indicate that entity is
 * partially filled (area has categories, or category has skills).
 * Areas and categories use even bit flags to indicate that entity is
 * fully filled (area has all categories and skills, or category has all skills).
 * Skill can be repserented with any bit.
 * It results in following:
 *   all the areas for the user are defined using single uint256.
 *     all the categories of a single area of user are defined using single uint256.
 *       all the skills of a single category of user are defined using single uint256.
 *
 * 00000001 is the first partial area.
 * 00000100 is the second partial area.
 * 00000101 is the first and second partial areas.
 * 00001101 is the first partial and second full areas.
 * 00000010 is invalid, because in order to be full area also should be partial.
 * Same encoding is used for categories.
 *
 * For skills:
 * 00000001 is the first skill.
 * 00000010 is the second skill.
 * 01000011 is the first, second and seventh skill.
 *
 * Example skills structure for some user:
 * 00110001 - Partial first area, and full third area.
 *   01001101 - First area: partial first and fourth category, full second category.
 *     11100000 - First category: sixth, senventh and eighth skills.
 *     10001001 - Fourth category: first, fourth and eighth skills.
 */
contract UserLibrary is StorageAdapter, MultiEventsHistoryAdapter, Roles2LibraryAdapter, BitOps {

    uint constant USER_LIBRARY_SCOPE = 21000;
    uint constant USER_LIBRARY_INVALID_AREA = USER_LIBRARY_SCOPE + 1;
    uint constant USER_LIBRARY_INVALID_CATEGORY = USER_LIBRARY_SCOPE + 2;

    event SkillAreasSet(address indexed self, address indexed user, uint areas);
    event SkillCategoriesSet(address indexed self, address indexed user, uint area, uint categories);
    event SkillsSet(address indexed self, address indexed user, uint area, uint category, uint skills);

    StorageInterface.AddressUIntMapping skillAreas;
    StorageInterface.AddressUIntUIntMapping skillCategories;
    StorageInterface.AddressUIntUIntUIntMapping skills;
    StorageInterface.AddressesSet users;

    modifier onlyValidArea(uint _value) {
        if (!_isValidAreaOrCategory(_value)) {
            assembly {
                mstore(0, 21001) // USER_LIBRARY_INVALID_AREA
                return(0, 32)
            }
        }
        _;
    }

    modifier onlyValidCategory(uint _value) {
        if (!_isValidAreaOrCategory(_value)) {
            assembly {
                mstore(0, 21002) // USER_LIBRARY_INVALID_CATEGORY
                return(0, 32)
            }
        }
        _;
    }

    function UserLibrary(
        Storage _store, 
        bytes32 _crate, 
        address _roles2Library
    )
    StorageAdapter(_store, _crate)
    Roles2LibraryAdapter(_roles2Library)
    public
    {
        skillAreas.init("skillAreas");
        skillCategories.init("skillCategories");
        skills.init("skills");
        users.init("users");
    }

    function setupEventsHistory(address _eventsHistory) auth external returns (uint) {
        require(_eventsHistory != 0x0);

        _setEventsHistory(_eventsHistory);
        return OK;
    }

    function getAreaInfo(
        address _user, 
        uint _area
    )
    singleOddFlag(_area)
    public view
    returns (bool partialArea, bool fullArea) 
    {
        uint areas = store.get(skillAreas, _user);
        return (_hasFlag(areas, _area), _hasFlag(areas, _area << 1));
    }

    function hasArea(address _user, uint _area) public view returns (bool _partial) {
        (_partial, ) = getAreaInfo(_user, _area);
    }

    function getCategoryInfo(address _user, uint _area, uint _category)
    singleOddFlag(_category)
    public view
    returns (bool partialCategory, bool fullCategory) 
    {
        bool partialArea;
        bool fullArea;
        (partialArea, fullArea) = getAreaInfo(_user, _area);
        if (!partialArea) {
            return (false, false);
        }
        if (fullArea) {
            return (true, true);
        }

        uint categories = store.get(skillCategories, _user, _area);
        return (_hasFlag(categories, _category), _hasFlag(categories, _category << 1));
    }

    function hasCategory(address _user, uint _area, uint _category) public view returns (bool _partial) {
        (_partial,) = getCategoryInfo(_user, _area, _category);
    }

    function hasSkill(
        address _user, 
        uint _area, 
        uint _category, 
        uint _skill
    ) 
    singleFlag(_skill) 
    public view 
    returns (bool) 
    {
        return hasSkills(_user, _area, _category, _skill);
    }

    function hasSkills(
        address _user, 
        uint _area, 
        uint _category, 
        uint _skills
    ) 
    public view 
    returns (bool) 
    {
        bool partialCategory;
        bool fullCategory;
        (partialCategory, fullCategory) = getCategoryInfo(_user, _area, _category);
        if (!partialCategory) {
            return false;
        }
        if (fullCategory) {
            return true;
        }
        
        uint userSkills = store.get(skills, _user, _area, _category);
        return _hasFlags(userSkills, _skills);
    }

    // If some area of category is full, then we are not looking into it cause observer can safely
    // assume that everything inside is filled.
    function getUserSkills(address _user) 
    public view 
    returns (
        uint areas, 
        uint[] _categories, 
        uint[] _skills
    ) {
        _categories = new uint[](2**7);
        _skills = new uint[](2*15);
        uint categoriesPointer = 0;
        uint skillsPointer = 0;

        areas = store.get(skillAreas, _user);
        for (uint area = 1; area != 0; area = area << 2) {
            if (_isFullOrNull(areas, area)) {
                continue;
            }

            uint _categoriesPointer = categoriesPointer;
            _categories[categoriesPointer++] = store.get(skillCategories, _user, area);
            for (uint category = 1; category != 0; category = category << 2) {
                if (_isFullOrNull(_categories[_categoriesPointer], category)) {
                    continue;
                }
                _skills[skillsPointer++] = store.get(skills, _user, area, category);
            }
        }
    }

    function getUsersCount() public view returns (uint) {
        return store.count(users);
    }

    /// @notice Gets a number of users that fulfill all requirements: area, all categories and masked skills.
    /// (similar to AND search)
    /// @param _area single area to query
    /// @param _categories list of categories that should be included in provided area
    /// @param _skills list of skills for each provided categories
    /// @param _fromIdx pagination param; should be 0 at the beginning, then the latest userIdx that comes from return
    /// @param _maxLen pagination param; could be getUsersCount() number
    /// @return {
    ///     "_count": "amount of found users by provided criterias",
    ///     "_userIdx": user index where query has stopped, pass to the next query
    /// }
    function getStrictUsersByAreaCount(
        uint _area, 
        uint[] _categories,
        uint[] _skills,
        uint _fromIdx,
        uint _maxLen
    ) 
    public 
    view 
    returns (uint _count, uint _userIdx) 
    {
        return _getUsersByAreaCount(
            _area,
            _categories,
            _skills,
            _fromIdx,
            _maxLen,
            _hasStrictSubsequenceOfSkillsInArea
        );
    }

    /// @notice Gets a number of users that fulfill any requirements: area, any category and masked skills.
    /// (similar to OR search)
    /// @param _area single area to query
    /// @param _categories list of categories that could be included in provided area
    /// @param _skills list of skills for each provided categories
    /// @param _fromIdx pagination param; should be 0 at the beginning, then the latest userIdx that comes from return
    /// @param _maxLen pagination param; could be getUsersCount() number
    /// @return {
    ///     "_count": "amount of found users by provided criterias",
    ///     "_userIdx": user index where query has stopped, pass to the next query
    /// }
    function getUsersByAreaCount(
        uint _area, 
        uint[] _categories,
        uint[] _skills,
        uint _fromIdx,
        uint _maxLen
    )
    public 
    view 
    returns (uint _count, uint _userIdx) 
    {
        return _getUsersByAreaCount(
            _area,
            _categories,
            _skills,
            _fromIdx,
            _maxLen,
            _hasAnySubsequenceOfSkillsInArea
        );
    }

    function _getUsersByAreaCount(
        uint _area, 
        uint[] _categories,
        uint[] _skills,
        uint _fromIdx,
        uint _maxLen,
        function(address, uint, uint[] memory, uint[] memory) internal view returns (bool) _hasSubsequeceOfSkills
    )
    onlyValidArea(_area)
    private
    view 
    returns (uint _count, uint _userIdx)
    {
        require(_categories.length == _skills.length);

        uint _usersCount = getUsersCount();
        require(_fromIdx < _usersCount);

        _maxLen = (_fromIdx + _maxLen <= _usersCount) ? _maxLen : (_usersCount - _fromIdx);

        for (_userIdx = _fromIdx; _userIdx < _fromIdx + _maxLen; _userIdx++) {
            if (gasleft() < 100000) {
                return (_count, _userIdx);
            }

            address _user = store.get(users, _userIdx);
            
            uint _userAreas = store.get(skillAreas, _user);
            _userAreas = _userAreas & _getAreaOrCategoryBits(_area);

            // NOTE: user has less covered areas than input (10 - user, 11 - input)
            if (!_hasFlags(_userAreas, _area)) { 
                continue;
            }

            // NOTE: user has all categories for this area and we can count '+1'
            if (!_isSingleFlag(_userAreas)) { 
                _count += 1;
                continue;
            }

            // NOTE: all skills and categories should fit, otherwise skip this user
            if (!_hasSubsequeceOfSkills(_user, _userAreas, _categories, _skills)) {
                continue;
            }

            _count += 1;
        }
    }

    function _hasStrictSubsequenceOfSkillsInArea(
        address _user, 
        uint _area, 
        uint[] _categories, 
        uint[] _skills
    ) 
    internal 
    view 
    returns (bool) 
    {
        uint _userCategories = store.get(skillCategories, _user, _area);
        for (uint _categoryIdx = 0; _categoryIdx < _categories.length; ++_categoryIdx) {
            uint _category = _categories[_categoryIdx];
            require(_isValidAreaOrCategory(_category));
            
            uint _userCategory = _userCategories & _getAreaOrCategoryBits(_category);

            // NOTE: user has less covered categories than input (10 - user, 11 - input)
            if (!_hasFlags(_userCategory, _category)) { 
                return false;
            }

            // NOTE: user has all skills in this category and we can count '+1'
            if (!_isSingleFlag(_userCategory)) { 
                continue;
            }
            
            // NOTE: skills could be passed as 111111 mask to get categories with any skills
            if (!_hasFlags(_skills[_categoryIdx], store.get(skills, _user, _area, _category))) { 
                return false;
            }
        }

        return true;
    }

    function _hasAnySubsequenceOfSkillsInArea(
        address _user, 
        uint _area, 
        uint[] _categories, 
        uint[] _skills
    ) 
    internal 
    view 
    returns (bool) 
    {
        if (_categories.length == 0) {
            return true;
        }

        uint _userCategories = store.get(skillCategories, _user, _area);
        for (uint _categoryIdx = 0; _categoryIdx < _categories.length; ++_categoryIdx) {
            uint _category = _categories[_categoryIdx];
            require(_isValidAreaOrCategory(_category));
            
            uint _userCategory = _userCategories & _getAreaOrCategoryBits(_category);

            // NOTE: allow to have another check if a category doesn't fit
            if (!_hasFlags(_userCategory, _category)) { 
                continue;
            }

            // NOTE: user has all skills in this category and we can count '+1'
            if (!_isSingleFlag(_userCategory)) { 
                return true;
            }
            
            // NOTE: skills could pass at least one check to be successfull
            if (_hasFlags(_skills[_categoryIdx], store.get(skills, _user, _area, _category))) { 
                return true;
            }
        }

        return false;
    }

    function setAreas(
        address _user, 
        uint _areas
    )
    auth
    ifEvenThenOddTooFlags(_areas)
    public
    returns (uint) 
    {
        for (uint area = 1; area != 0; area = area << 2) {
            if (_isFullOrNull(_areas, area)) {
                continue;
            }
            if (store.get(skillCategories, _user, area) == 0) {
                return _emitErrorCode(USER_LIBRARY_INVALID_AREA);
            }
        }

        _setAreas(_user, _areas);

        return OK;
    }

    function setCategories(
        address _user, 
        uint _area, 
        uint _categories
    )
    auth
    singleOddFlag(_area)
    ifEvenThenOddTooFlags(_categories)
    hasFlags(_categories)
    public
    returns (uint) 
    {
        _addArea(_user, _area);
        
        for (uint category = 1; category != 0; category = category << 2) {
            if (_isFullOrNull(_categories, category)) {
                continue;
            }
            if (store.get(skills, _user, _area, category) == 0) {
                return _emitErrorCode(USER_LIBRARY_INVALID_CATEGORY);
            }
        }

        _setCategories(_user, _area, _categories);

        return OK;
    }

    function setSkills(
        address _user, 
        uint _area, 
        uint _category, 
        uint _skills
    )
    auth
    singleOddFlag(_area)
    singleOddFlag(_category)
    hasFlags(_skills)
    public
    returns (uint)
     {
        _addArea(_user, _area);
        _addCategory(_user, _area, _category);
        _setSkills(_user, _area, _category, _skills);
        return OK;
    }

    function addMany(address _user, uint _areas, uint[] _categories, uint[] _skills) auth public returns (uint) {
        return _setMany(_user, _areas, _categories, _skills, false);
    }

    function setMany(address _user, uint _areas, uint[] _categories, uint[] _skills) auth public returns (uint) {
        return _setMany(_user, _areas, _categories, _skills, true);
    }

    function _setMany(
        address _user, 
        uint _areas, 
        uint[] _categories, 
        uint[] _skills, 
        bool _overwrite
    )
    internal
    returns (uint) 
    {
        uint categoriesCounter = 0;
        uint skillsCounter = 0;
        if (!_ifEvenThenOddTooFlags(_areas)) {
            return _emitErrorCode(USER_LIBRARY_INVALID_AREA);
        }
        
        _setAreas(_user, _overwrite ? _areas : (store.get(skillAreas, _user) | _areas));
        
        for (uint area = 1; area != 0; area = area << 2) {
            if (_isFullOrNull(_areas, area)) {
                // Nothing should be put inside full or empty area.
                continue;
            }

            require(_ifEvenThenOddTooFlags(_categories[categoriesCounter]));
            require(_categories[categoriesCounter] != 0);

            // Set categories for current partial area.
            _setCategories(_user, area, _overwrite ? _categories[categoriesCounter] : (store.get(skillCategories, _user, area) | _categories[categoriesCounter]));
            
            for (uint category = 1; category != 0; category = category << 2) {
                if (_isFullOrNull(_categories[categoriesCounter], category)) {
                    // Nothing should be put inside full or empty category.
                    continue;
                }
                require(_skills[skillsCounter] != 0);
                // Set skills for current partial category.
                _setSkills(_user, area, category, _skills[skillsCounter]);
                // Move to next skills.
                skillsCounter += 1;
            }
            // Move to next categories.
            categoriesCounter += 1;
        }
        return OK;
    }


    function _addArea(address _user, uint _area) internal {
        if (hasArea(_user, _area)) {
            return;
        }

        _setAreas(_user, store.get(skillAreas, _user) | _area);
    }

    function _addCategory(address _user, uint _area, uint _category) internal {
        if (hasCategory(_user, _area, _category)) {
            return;
        }
        _setCategories(_user, _area, store.get(skillCategories, _user, _area) | _category);
    }

    function _setAreas(address _user, uint _areas) internal {
        store.add(users, _user);
        store.set(skillAreas, _user, _areas);
        _emitSkillAreasSet(_user, _areas);
    }

    function _setCategories(address _user, uint _area, uint _categories) internal {
        store.add(users, _user);
        store.set(skillCategories, _user, _area, _categories);
        _emitSkillCategoriesSet(_user, _area, _categories);
    }

    function _setSkills(address _user, uint _area, uint _category, uint _skills) internal {
        store.add(users, _user);
        store.set(skills, _user, _area, _category, _skills);
        _emitSkillsSet(_user, _area, _category, _skills);
    }

    function _isValidAreaOrCategory(uint _value) private pure returns (bool) {
        if ((_isSingleFlag(_value) && _isOddFlag(_value)) ||
            (_ifEvenThenOddTooFlags(_value))
        ) {
            return true;
        }
    }

    function _getAreaOrCategoryBits(uint _value) private pure returns (uint) {
        return _isSingleFlag(_value) ? (_value | (_value << 1)) : _value; 
    }

    function _emitSkillAreasSet(address _user, uint _areas) internal {
        UserLibrary(getEventsHistory()).emitSkillAreasSet(_user, _areas);
    }

    function _emitSkillCategoriesSet(address _user, uint _area, uint _categories) internal {
        UserLibrary(getEventsHistory()).emitSkillCategoriesSet(_user, _area, _categories);
    }

    function _emitSkillsSet(address _user, uint _area, uint _category, uint _skills) internal {
        UserLibrary(getEventsHistory()).emitSkillsSet(_user, _area, _category, _skills);
    }

    function emitSkillAreasSet(address _user, uint _areas) public {
        emit SkillAreasSet(_self(), _user, _areas);
    }

    function emitSkillCategoriesSet(address _user, uint _area, uint _categories) public {
        emit SkillCategoriesSet(_self(), _user, _area, _categories);
    }

    function emitSkillsSet(address _user, uint _area, uint _category, uint _skills) public {
        emit SkillsSet(_self(), _user, _area, _category, _skills);
    }

}
