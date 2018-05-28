## Contract Owner

./node_modules/.bin/truffle console --network ntr1x

web3.eth.getAccounts((e,a) => console.log(a))
web3.eth.getBalance("0xfebc7d461b970516c6d3629923c73cc6475f1d13", (e,b) => console.log(b))

web3.eth.sendTransaction({from: "0xfebc7d461b970516c6d3629923c73cc6475f1d13", to:"0x00bd07e19ff6257156ce71368c315e61f900142d", value:web3.toWei(10, "ether")}, (e,r) => console.log(r))
web3.eth.sendTransaction({from: "0xfebc7d461b970516c6d3629923c73cc6475f1d13", to:"0x005bd4cb3cb08f92a3f34fc5a970f133405188af", value:web3.toWei(10, "ether")}, (e,r) => console.log(r))
web3.eth.sendTransaction({from: "0xfebc7d461b970516c6d3629923c73cc6475f1d13", to:"0x00aabd706f4ee7ec560517f82a1d492b21fef05e", value:web3.toWei(10, "ether")}, (e,r) => console.log(r))
web3.eth.sendTransaction({from: "0xfebc7d461b970516c6d3629923c73cc6475f1d13", to:"0x003045868e9b5405f710643d1b31dab330b186ec", value:web3.toWei(10, "ether")}, (e,r) => console.log(r))
web3.eth.sendTransaction({from: "0xfebc7d461b970516c6d3629923c73cc6475f1d13", to:"0x00b436db5bd741285b98d6bcf488eceadb4c410e", value:web3.toWei(10, "ether")}, (e,r) => console.log(r))
web3.eth.sendTransaction({from: "0xfebc7d461b970516c6d3629923c73cc6475f1d13", to:"0x002abe91a1a77ea4c2529f9a3498dae735adac33", value:web3.toWei(10, "ether")}, (e,r) => console.log(r))

web3.eth.getBalance("0x00bd07e19ff6257156ce71368c315e61f900142d", (e,b) => console.log(b))
web3.eth.getBalance("0x005bd4cb3cb08f92a3f34fc5a970f133405188af", (e,b) => console.log(b))
web3.eth.getBalance("0x00aabd706f4ee7ec560517f82a1d492b21fef05e", (e,b) => console.log(b))
web3.eth.getBalance("0x003045868e9b5405f710643d1b31dab330b186ec", (e,b) => console.log(b))
web3.eth.getBalance("0x00b436db5bd741285b98d6bcf488eceadb4c410e", (e,b) => console.log(b))
web3.eth.getBalance("0x002abe91a1a77ea4c2529f9a3498dae735adac33", (e,b) => console.log(b))


Roles2Library.deployed().then(r => r.setRootUser("0x00bd07e19ff6257156ce71368c315e61f900142d", true));

const ModeratorRole = 10;
BoardController.deployed().then(b => console.log(b.contract.createBoard.getData(0,0,0,0).slice(0,10)))
BoardController.deployed().then(b => console.log(b.contract.closeBoard.getData(0).slice(0,10)))

Roles2Library.deployed().then(r => r.addRoleCapability(ModeratorRole, BoardController.address, "0x210c1f29"));
Roles2Library.deployed().then(r => r.addRoleCapability(ModeratorRole, BoardController.address, "0xd2afeeeb"));

ERC20Library.deployed().then(erc20 => erc20.addContract(FakeCoin.address))


UserLibrary.deployed().then(u => u.setSkills("0x00aabd706f4ee7ec560517f82a1d492b21fef05e", 16, 16, 16))
UserLibrary.deployed().then(u => u.setSkills("0x00aabd706f4ee7ec560517f82a1d492b21fef05e", 64, 64, 64))

UserLibrary.deployed().then(u => u.setSkills("0x003045868e9b5405f710643d1b31dab330b186ec", 16, 16, 16))
UserLibrary.deployed().then(u => u.setSkills("0x003045868e9b5405f710643d1b31dab330b186ec", 64, 64, 64))


## Admin (0x00bd07e19ff6257156ce71368c315e61f900142d)

Roles2Library.deployed().then(r => r.addUserRole("0x005bd4cb3cb08f92a3f34fc5a970f133405188af", 10))

## Moderator (0x005bd4cb3cb08f92a3f34fc5a970f133405188af)

// "Developers", "Developers Board Description"
BoardController.deployed().then(b => b.createBoard(1, 1, 1))
// "Tech Writers", "Tech Writers Board Description"
BoardController.deployed().then(b => b.createBoard(1, 1, 1))

BoardController.deployed().then(b => b.bindJobWithBoard(1, 5))
BoardController.deployed().then(b => b.bindJobWithBoard(1, 6))
BoardController.deployed().then(b => b.bindJobWithBoard(1, 7))
BoardController.deployed().then(b => b.bindJobWithBoard(1, 8))

BoardController.deployed().then(b => b.bindJobWithBoard(2, 1))
BoardController.deployed().then(b => b.bindJobWithBoard(2, 2))
BoardController.deployed().then(b => b.bindJobWithBoard(2, 3))

## Client (0x00b436db5bd741285b98d6bcf488eceadb4c410e)

// For test
FakeCoin.deployed().then(f => f.mint("0x00b436db5bd741285b98d6bcf488eceadb4c410e", 100000))

PaymentGateway.deployed().then( p => p.deposit(10000, FakeCoin.address))

JobController.deployed().then(j => j.postJob(4,4,4,10,"Task 1"))
JobController.deployed().then(j => j.postJob(4,4,4,20,"Task 2"))
JobController.deployed().then(j => j.postJob(4,4,4,30,"Task 3"))
JobController.deployed().then(j => j.postJob(4,4,4,40,"Task id 4"))
JobController.deployed().then(j => j.postJob(64,64,64,50,"Task id 5"))
JobController.deployed().then(j => j.postJob(16,16,16,60,"Task id 6"))
JobController.deployed().then(j => j.postJob(16,16,16,70,"Task id 7"))
JobController.deployed().then(j => j.postJob(16,16,16,80,"Task id 8"))
JobController.deployed().then(j => j.postJob(16,16,16,90,"Task id 9"))

JobController.deployed().then(j => j.acceptOffer(5, "0x00aabd706f4ee7ec560517f82a1d492b21fef05e"))
JobController.deployed().then(j => j.acceptOffer(6, "0x003045868e9b5405f710643d1b31dab330b186ec"))
JobController.deployed().then(j => j.cancelJob(5))

## Worker 1 (0x00aabd706f4ee7ec560517f82a1d492b21fef05e)
JobController.deployed().then(j => j.postJobOffer(5, FakeCoin.address, 10, 10, 10))
JobController.deployed().then(j => j.postJobOffer(6, FakeCoin.address, 20, 20, 20))
JobController.deployed().then(j => j.postJobOffer(7, FakeCoin.address, 20, 20, 20))
JobController.deployed().then(j => j.postJobOffer(8, FakeCoin.address, 20, 20, 20))
JobController.deployed().then(j => j.postJobOffer(9, FakeCoin.address, 20, 20, 20))

## Worker 2 (0x003045868e9b5405f710643d1b31dab330b186ec)
JobController.deployed().then(j => j.postJobOffer(6, FakeCoin.address, 20, 20, 20))
