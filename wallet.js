// import DashPhrase from "dashphrase";
// import DashHd from "dashhd";
// import DashKeys from "dashkeys";

////@ts-expect-error
//let DashPhrase = window.DashPhrase;

/** @type {import('dashhd')} */
//@ts-expect-error
let DashHd = globalThis.DashHd || require("dashhd");

/** @type {import('dashkeys')} */
//@ts-expect-error
let DashKeys = globalThis.DashKeys || require("dashkeys");

////@ts-expect-error
//let DashTx = window.DashTx;
////@ts-expect-error
//let Secp256k1 = window.nobleSecp256k1;

/**
 * @typedef {KeyInfo & KeyStateMini} KeyState
 */

/**
 * @typedef KeyInfo
 * @prop {String} network
 * @prop {WalletID} walletId
 * @prop {AccountID} accountId
 * @prop {Number} account
 * @prop {Usage} usage
 * @prop {Number} index
 * @prop {String} hdpath
 * @prop {Base58Check} address
 * @prop {Base58Check} wif
 * @prop {import('dashhd').HDKey} hdkey
 * @prop {Uint8Array?} [_privateKey]
 * @prop {Hex} publicKey
 * @prop {Hex} pubKeyHash
 */

/**
 * @typedef KeyStateMini
 * @prop {Array<Number>} satoshisList
 * @prop {Number} reservedAt
 * @prop {Number} sharedAt
 * @prop {Boolean} hasBeenUsed
 * @prop {Number} updatedAt
 */

/**
 * @typedef XKeyInfo
 * @prop {String} network
 * @prop {WalletID} walletId
 * @prop {AccountID} accountId
 * @prop {Number} accountIndex
 * @prop {import('dashhd').HDXKey} usageKey
 */

/**
 * @typedef AccountInfo
 * @prop {String} network
 * @prop {WalletID} walletId
 * @prop {AccountID} accountId
 * @prop {import('dashhd').HDAccount} accountKey
 */

const USAGE_RECEIVE = DashHd.RECEIVE;
const USAGE_CHANGE = DashHd.CHANGE;
const USAGE_COINJOIN = 2;
// const ROUNDS_TARGET = 16;

const COINTYPE_DASH = 5;
const COINTYPE_TESTNET = 1; // testnet (for all coins)

// App.network = MAINNET;
// App.coinType = COINTYPE_DASH;
// App.hdVersions = DashHd.MAINNET;

let Wallet = {};

Wallet.USAGE_RECEIVE = USAGE_RECEIVE;
Wallet.USAGE_CHANGE = USAGE_CHANGE;
Wallet.USAGE_COINJOIN = USAGE_COINJOIN;
Wallet.COINTYPE_DASH = COINTYPE_DASH;
Wallet.COINTYPE_MAINNET = COINTYPE_DASH;
Wallet.COINTYPE_TESTNET = COINTYPE_TESTNET; // testnet (for all coins)

/** @type {Object.<AccountID, Array<import('dashhd').HDXKey>>} */
Wallet._coinjoinXPrvs = {};

/**
 * @typedef KeyStateByKind
 * @prop {Object.<Address, KeyState>} keysByAddress
 * @prop {Object.<Address, KeyState>} spendable
 * @prop {Object.<Address, KeyState>} unused
 * @prop {Object.<Address, KeyState>} reserved
 * @prop {Object.<Address, KeyState>} used
 */

/** @type {Object.<String, KeyStateByKind>} */
Wallet._caches = {};

Wallet._caches.mainnet = {
	keysByAddress: {},
	/** @type {Object.<Address, KeyState>} */
	spendable: {},
	/** @type {Object.<Address, KeyState>} */
	unused: {},
	/** @type {Object.<Address, KeyState>} */
	reserved: {},
	/** @type {Object.<Address, KeyState>} */
	used: {},
};

Wallet._caches.testnet = {
	/** @type {Object.<Address, KeyState>} */
	keysByAddress: {},
	/** @type {Object.<Address, KeyState>} */
	spendable: {},
	/** @type {Object.<Address, KeyState>} */
	unused: {},
	/** @type {Object.<Address, KeyState>} */
	reserved: {},
	/** @type {Object.<Address, KeyState>} */
	used: {},
};

Wallet._emptyKeyStateMini = {
	satoshisList: [],
	hasBeenUsed: false,
	reservedAt: 0,
	sharedAt: 0,
	updatedAt: 0,
};

/** @typedef {String} Base58Check */
/** @typedef {String} Hex */
/** @typedef {String} WalletID */
/** @typedef {String} AccountID */
/** @typedef {Number} Usage */
/** @typedef {Base58Check} Address */

/**
 * Using sparse arrays to track usage and index
 * @typedef WalletStateSparse
 * @prop {Array<KeyState>} unused
 * @prop {Array<KeyState>} spendable
 * @prop {Array<KeyState>} reserved
 * @prop {Array<KeyState>} used
 */

/** @type {Object.<AccountID, Array<WalletStateSparse>>} */
Wallet._walletStates = {
	"<example-account-id>": [
		{
			unused: [],
			spendable: [],
			reserved: [],
			used: [],
		},
	],
};

/**
 * @param {AccountID} accountId
 * @param {Usage} usage - index (0 receive, 1 change, 2+ coinjoin)
 * @returns {WalletStateSparse}
 */
Wallet._getUsageState = function (accountId, usage) {
	let accountState = Wallet._walletStates[accountId];
	if (!accountState) {
		accountState = [];
		Wallet._walletStates[accountId] = accountState;
	}

	/** @type {WalletStateSparse} */
	let usageState = accountState[usage];
	if (!usageState) {
		usageState = {
			unused: [],
			spendable: [],
			reserved: [],
			used: [],
		};
		accountState[usage] = usageState;
	}

	return usageState;
};

Wallet.init = async function () {
	// We're limited to about 120,000 keys with _very_ limited data
	// Local Storage safe:
	// - reservedAt Date.now()
	// - sat values of utxos ex: [123456, 76543]
	// - number of transactions: T

	Wallet.Addresses._cache = await Wallet.Addresses.all();
};

/**
 * @param {String} network
 * @param {import('dashhd').HDWallet} walletKey
 * @param {Number} accountIndex
 * @returns {Promise<AccountInfo>}
 */
Wallet.rawGetAccountKey = async function (network, walletKey, accountIndex) {
	let walletId = await DashHd.toId(walletKey);
	/** @type {import('dashhd').HDAccount} */
	let accountKey = await walletKey.deriveAccount(accountIndex);
	/** @type {AccountID} */
	let accountId = await DashHd.toId(accountKey);

	return {
		network,
		walletId,
		accountId,
		accountKey,
	};
};

/**
 * @param {String} network
 * @param {import('dashhd').HDWallet} walletKey
 * @param {Number} accountIndex
 * @param {Usage} usage - DashHd.RECEIVE, DashHd.RECEIVE, Wallet.USAGE_COINJOIN
 * @returns {Promise<XKeyInfo>}
 */
Wallet.rawGetUsageKey = async function (
	network,
	walletKey,
	accountIndex,
	usage,
) {
	let walletId = await DashHd.toId(walletKey);
	/** @type {import('dashhd').HDAccount} */
	let accountKey = await walletKey.deriveAccount(accountIndex);
	/** @type {AccountID} */
	let accountId = await DashHd.toId(accountKey);
	/** @type {import('dashhd').HDXKey} */
	let usageKey = await accountKey.deriveXKey(usage);

	return {
		network,
		walletId,
		accountId,
		accountIndex,
		usageKey,
	};
};

Wallet.CJ = {};

/**
 * Reserves an address for denominating a coin
 * @param {AccountInfo} cjAccountInfo
 * @param {Address} [address]
 * @param {Number} [denominationPoolSize] - 1: select next denomination key, 1+: select denomination key randomly from pool
 * @returns {Promise<KeyState>}
 */
Wallet.CJ.takeDenominationKey = async function (
	cjAccountInfo,
	address,
	denominationPoolSize,
) {
	if (address) {
		let keyState = Wallet.Addresses._cache[address];
		let usageRound = keyState.usage - USAGE_COINJOIN;

		let mustDenominate = usageRound < 0;
		if (!mustDenominate) {
			let msg = `'${address}' is already in round ${usageRound} of CoinJoin in wallet ${keyState.walletId}'s account ${keyState.accountId}`;
			let err = new Error(msg);
			Object.assign(err, { code: "E_COINJOIN_IN_OTHER_WALLET" });
			throw err;
		}
	}

	let usageKey = await Wallet._getXPrv(cjAccountInfo, USAGE_COINJOIN);
	let xkeyInfo = {
		network: cjAccountInfo.network,
		walletId: cjAccountInfo.walletId,
		accountId: cjAccountInfo.accountId,
		// jshint bitwise: false
		accountIndex: cjAccountInfo.accountKey.index & 0x7fffffff, // (for "hardening")
		usageKey: usageKey,
	};

	let maxRoundsForReal = 42; // anything beyond this would be meaningless
	let maxTriesCount = 3; // anything more than 2 is excessive
	let poolSize = 0;
	if (denominationPoolSize === 1) {
		poolSize = maxTriesCount;
	} else if (poolSize < 4) {
		poolSize = 4;
	}
	let keyStates = await Wallet.takeUnusedKeys(
		xkeyInfo,
		maxTriesCount,
		poolSize,
	);
	let lastError = new Error("none");
	for (let keyState of keyStates) {
		try {
			for (
				let usage = USAGE_COINJOIN + 1;
				usage <= maxRoundsForReal;
				usage += 1
			) {
				let usageKey = await Wallet._getXPrv(cjAccountInfo, usage);
				void (await usageKey.deriveAddress(keyState.index));
			}
		} catch (e) {
			//@ts-expect-error // it's an error bro
			lastError = e;
			continue;
		}

		return keyState;
	}
	lastError.message = `failure to verify coinjoin round addresses for '${address}': ${lastError.message}`;
	throw lastError;
};

/**
 * Reserves an address key for a CoinJoin round
 * @param {AccountInfo} cjAccountInfo
 * @param {Address} address
 * @param {Number} maxRounds - typically 16
 * @param {XKeyInfo} destinationXPrvInfo - RECEIVE usage xprv
 * @param {Number} [destinationPoolSize] - 1: select first destination key, 1+: select destination key randomly from pool
 * @returns {Promise<KeyState>}
 */
Wallet.CJ.takeRoundKey = async function (
	cjAccountInfo,
	address,
	maxRounds,
	destinationXPrvInfo,
	destinationPoolSize,
) {
	/** @type {KeyState} */
	let roundInfo = Wallet.Addresses._cache[address];

	// Implementation decisions (not decided by spec)
	// - Which account is designated the coinjoin account?
	// - Which usage is designated for coinjoin?
	//
	// Possible strategies:
	// - use a wallet entirely, or just a separate account
	// - skip addresses by 16 and fill in the gaps
	// - track addresses by history to 16 hops (less accurate)
	// - in a separate wallet or account, use all usages 0-15
	// - in an existing wallet or account, use usages 2-16
	//                                     (the 16th goes back to 0 receive)
	// - do we denominate in the main wallet? or the CJ wallet (2-17)?

	let usageRound = roundInfo.usage - USAGE_COINJOIN;
	if (usageRound >= maxRounds) {
		// let msg = `${address} has already been through ${maxRounds} CoinJoin rounds`;
		// let err = new Error(msg);
		// Object.assign(err, { code: "E_COINJOIN_MAX_ROUNDS" });
		// throw err;
		// if (err.code !== "E_COINJOIN_MAX_ROUNDS") {
		// 	throw err;
		// }

		let keyState = await Wallet.takeUnusedKey(
			destinationXPrvInfo,
			destinationPoolSize,
		);
		return keyState;
	}

	let mustDenominate = usageRound < 0;
	if (mustDenominate) {
		let msg = `${address} has not been denominated and/or locked for coinjoin`;
		let err = new Error(msg);
		Object.assign(err, { code: "E_NOT_COINJOIN_LOCKED" });
		throw err;
	}

	let nextUsage = roundInfo.usage + 1;
	let usageKey = await Wallet._getXPrv(cjAccountInfo, nextUsage);
	let xkeyInfo = {
		network: roundInfo.network,
		walletId: roundInfo.walletId,
		accountId: roundInfo.accountId,
		// jshint bitwise: false
		accountIndex: cjAccountInfo.accountKey.index & 0x7fffffff, // (for "hardening")
		usageKey: usageKey,
	};
	let addressKey = await usageKey.deriveAddress(roundInfo.index);

	// note: we can skip the failed index check here
	//       because it is done when denominating
	let keyInfo = await Wallet._rawGetKeyInfo(xkeyInfo, addressKey);
	let keyState = Wallet._mergeKeyState(keyInfo);
	return keyState;
};

/**
 * @param {KeyInfo} keyInfo
 */
Wallet._mergeKeyState = function (keyInfo) {
	let _cacheInfo =
		Wallet.Addresses._cache[keyInfo.address] ||
		globalThis.structuredClone(Wallet._emptyKeyStateMini);

	Wallet.Addresses._cache[keyInfo.address] = Object.assign(_cacheInfo, keyInfo);
	return _cacheInfo;
};

/**
 * @param {AccountInfo} accountInfo
 * @param {Number} usage
 * @returns {Promise<import('dashhd').HDXKey>}
 */
Wallet._getXPrv = async function (accountInfo, usage) {
	let xprvKeys = Wallet._coinjoinXPrvs[accountInfo.accountId];
	if (!xprvKeys) {
		xprvKeys = [];
		Wallet._coinjoinXPrvs[accountInfo.accountId] = xprvKeys;
	}

	let xprvKey = xprvKeys[usage];
	if (!xprvKey) {
		xprvKey = await accountInfo.accountKey.deriveXKey(usage);
		xprvKeys[usage] = xprvKey;
	}

	return xprvKey;
};

/**
 * Take unused keys and mark them as reserved
 * @param {XKeyInfo} xkeyInfo
 * @param {Number} [poolSize] - 1: select first key, 1+: select key randomly from pool
 */
Wallet.takeUnusedKey = async function (xkeyInfo, poolSize) {
	let keyStates = await Wallet.takeUnusedKeys(xkeyInfo, 1, poolSize);
	let keyState = keyStates[0];

	keyState.reservedAt = Date.now();
	Wallet.updateKeyState(keyState);

	return keyState;
};

/**
 * Take unused keys, marking them as reserved
 * @param {XKeyInfo} xkeyInfo
 * @param {Number} count - how many to reserve
 * @param {Number} [poolSize] - how many to select from (default: 10*count)
 */
Wallet.takeUnusedKeys = async function (xkeyInfo, count, poolSize) {
	if (!poolSize) {
		poolSize = 10 * count;
	}

	Wallet._reserveLock = Wallet._reserveLock.then(async function () {
		let _keyStates = await Wallet.peekUnusedKeys(xkeyInfo, poolSize);
		if (poolSize !== count) {
			void knuthShuffle(_keyStates);
		}

		_keyStates = _keyStates.slice(0, count);
		for (let keyState of _keyStates) {
			keyState.reservedAt = Date.now();
			Wallet.updateKeyState(keyState);
		}

		return _keyStates;
	});

	let keyStates = await Wallet._reserveLock;
	return keyStates;
};
/** @type {Promise<Array<KeyState>>} */ //@ts-expect-error
Wallet._reserveLock = Promise.resolve(null);

/**
 * Get (offline-cached) list of unused receive addresses, without reserving them
 * @param {XKeyInfo} xkeyInfo
 * @param {Number} [count=100] - get addresses from offset to offset + N-1, ex: 0-99
 */
Wallet.peekUnusedKeys = async function (xkeyInfo, count = 100) {
	// TODO OT Quick Note: TODO
	// On lead:
	// - first check existing utxos again to see if they've been spent
	// - next check if unused coins now have money
	// - optimize for happy path, offline path, then online path

	// if (xkeyInfo.accountId !== accountId) {
	// 	throw new Error(
	// 		`xkeyInfo.accountId must be set and equal to the desired accountId`,
	// 	);
	// }
	let usageState = Wallet._getUsageState(
		xkeyInfo.accountId,
		xkeyInfo.usageKey.index,
	);
	let indexes = Object.keys(usageState.unused);

	let n = indexes.length;
	let offset = 0; // TODO use cursor to track what we've indexed (not the last indexed)
	let limit = count;

	for (; n < count; ) {
		usageState = await Wallet.getKeyStates(
			xkeyInfo.accountId,
			xkeyInfo,
			offset,
			limit,
		);
		indexes = Object.keys(usageState.unused);
		n = indexes.length;
		offset += limit;
		// limit = count - n; // overshoot rather than undershoot
	}

	let keyStates = [];
	indexes = Object.keys(usageState.unused);
	indexes = indexes.slice(0, count); // account for overshooting
	for (let key of indexes) {
		let i = Number(key);
		let keyInfo = usageState.unused[i];
		keyStates.push(keyInfo);
	}

	return keyStates;
};

/** @param {String} network */
Wallet.getCachedKeysMap = function (network) {
	return Wallet._caches[network].keysByAddress;
};

/**
 * @param {String} network
 * @param {String} address
 */
Wallet.getKeyStateByAddress = function (network, address) {
	return Wallet._caches[network].keysByAddress[address];
};

/**
 * Get (offline-cached) list of unused receive addresses
 * @param {AccountID} accountId
 * @param {XKeyInfo} xkeyInfo
 * @param {Number} [offset] - the index to start from, or 0
 * @param {Number} [limit=100] - get addresses from offset to offset + N-1, ex: 0-99
 */
Wallet.getKeyStates = async function (
	accountId,
	xkeyInfo,
	offset = 0,
	limit = 100,
) {
	let keyInfos = await Wallet.rawGetKeyInfos(xkeyInfo, offset, limit);

	let usageState = Wallet._getUsageState(accountId, xkeyInfo.usageKey.index);
	for (let keyInfo of keyInfos) {
		let keyState = Wallet._mergeKeyState(keyInfo);
		void Wallet._updateKeyState(usageState, keyState);
	}

	return usageState;
};

/**
 * @param {KeyState} keyState
 */
Wallet.updateKeyState = function (keyState) {
	let usageState = Wallet._getUsageState(keyState.accountId, keyState.usage);
	void Wallet._updateKeyState(usageState, keyState);
};

/**
 * @param {WalletStateSparse} usageState
 * @param {KeyState} keyState
 */
Wallet._updateKeyState = function (usageState, keyState) {
	let caches = Wallet._caches[keyState.network];
	caches.keysByAddress[keyState.address] = keyState;

	delete caches.unused[keyState.address];
	delete caches.spendable[keyState.address];
	delete caches.reserved[keyState.address];
	delete caches.used[keyState.address];

	delete usageState.unused[keyState.index];
	delete usageState.spendable[keyState.index];
	delete usageState.reserved[keyState.index];
	delete usageState.used[keyState.index];

	if (keyState.satoshisList?.length) {
		// TODO if this is reused, it must be handled differently
		usageState.spendable[keyState.index] = keyState;
		caches.spendable[keyState.address] = keyState;
	} else if (keyState.hasBeenUsed) {
		usageState.used[keyState.index] = keyState;
		caches.used[keyState.address] = keyState;
	} else if (keyState.reservedAt || keyState.sharedAt) {
		// TODO check if reservation is expired
		// also we need two types of reservations:
		// - external "made public at"
		// - internal "reserved at"
		// anything public (i.e. shared via QR, email, etc) should be considered spent
		usageState.reserved[keyState.index] = keyState;
		caches.reserved[keyState.address] = keyState;
	} else {
		usageState.unused[keyState.index] = keyState;
		caches.unused[keyState.address] = keyState;
	}
};

/**
 * Get (offline-cached) list of unused receive addresses
 * @param {XKeyInfo} xkeyInfo
 * @param {Number} [offset] - the index to start from, or 0
 * @param {Number} [limit=100] - get addresses from offset to offset + N-1, ex: 0-99
 */
Wallet.rawGetKeyInfos = async function (xkeyInfo, offset = 0, limit = 100) {
	let keyInfos = [];
	let end = offset + limit;
	for (let index = offset; index < end; index += 1) {
		let addressKey;
		try {
			addressKey = await xkeyInfo.usageKey.deriveAddress(index);
		} catch (e) {
			end += 1; // to make up for skipping on error
			continue;
		}

		let keyInfo = await Wallet._rawGetKeyInfo(xkeyInfo, addressKey);
		keyInfos.push(keyInfo);
	}

	return keyInfos;
};

/**
 * @param {XKeyInfo} xkeyInfo
 * @param {import('dashhd').HDKey} addressKey
 * @returns {Promise<KeyInfo>}
 */
Wallet._rawGetKeyInfo = async function (xkeyInfo, addressKey) {
	let usage = xkeyInfo.usageKey.index;
	let validUsage = usage >= 0 && usage <= 16;
	if (!validUsage) {
		let err = new Error(`unknown usage '${usage}'`);
		throw err;
	}

	if (!addressKey.privateKey) {
		throw new Error(`[wallet.js] address key is missing private bytes`);
	}
	let wif = await DashHd.toWif(addressKey.privateKey, {
		version: xkeyInfo.network,
	});
	let address = await DashHd.toAddr(addressKey.publicKey, {
		version: xkeyInfo.network,
	});

	let coinType = 5;
	if (xkeyInfo.network !== "mainnet") {
		coinType = 1;
	}
	let hdpath = `m/44'/${coinType}'/${xkeyInfo.accountIndex}'/${usage}`;

	let pkhBytes = await DashKeys.pubkeyToPkh(addressKey.publicKey);
	let keyInfo = {
		network: xkeyInfo.network ?? "",
		walletId: xkeyInfo.walletId ?? "",
		accountId: xkeyInfo.accountId ?? "",
		account: xkeyInfo.accountIndex ?? -1,
		usage: usage,
		index: addressKey.index,
		hdpath: hdpath,
		address: address, // ex: XrZJJfEKRNobcuwWKTD3bDu8ou7XSWPbc9
		wif: wif, // ex: XCGKuZcKDjNhx8DaNKK4xwMMNzspaoToT6CafJAbBfQTi57buhLK
		hdkey: addressKey,
		_privateKey: addressKey.privateKey || null,
		publicKey: DashKeys.utils.bytesToHex(addressKey.publicKey),
		pubKeyHash: DashKeys.utils.bytesToHex(pkhBytes),
	};

	return keyInfo;
};

const ADDR_PRE = "$_";

Wallet.Addresses = {};

/** @type {Object.<String, KeyState>} */
Wallet.Addresses._cache = {};

/**
 * @param {String} address
 * @param {KeyStateMini?} keyStateMini
 */
Wallet.Addresses.set = async function (address, keyStateMini) {
	if (keyStateMini === null) {
		localStorage.removeItem(address);
		return;
	}

	let data;
	if (keyStateMini.satoshisList?.length) {
		data = keyStateMini.satoshisList;
	} else if (keyStateMini.reservedAt > 0) {
		data = keyStateMini.reservedAt;
	} else if (keyStateMini.hasBeenUsed) {
		data = 0;
	} else {
		// TODO save info on sharedAt, updatedAt, maybe coinjoin
		return;
	}

	let dataJson = JSON.stringify(data);
	localStorage.setItem(`${ADDR_PRE}${address}`, dataJson);
};

/**
 * @typedef Delta
 * @prop {String} address
 * @prop {Number} satoshis
 * @prop {String} txid
 * @prop {Number} index
 */

/**
 * @param {Array<Delta>} deltas
 */
Wallet.Addresses.setDeltas = async function (deltas) {
	// TODO
	// - update in-memory cache (potentially the full data)
	// - update storage (very little data)
	// - will we need the full data from the network again?
	//   (YES! but only when spending utxos)

	/** @type {KeyStateMini} */
	let keyStateMini = {
		satoshisList: [],
		hasBeenUsed: false,
		reservedAt: 0,
		sharedAt: 0,
		updatedAt: 0,
	};

	// credits
	for (let delta of deltas) {
		if (delta.satoshis > 0) {
			keyStateMini.satoshisList.push(delta.satoshis);
		}
	}

	// debits
	for (let delta of deltas) {
		if (delta.satoshis < 0) {
			let satoshis = Math.abs(delta.satoshis);
			let index = keyStateMini.satoshisList.indexOf(satoshis);
			if (index >= 0) {
				keyStateMini.satoshisList.splice(index, 1);
			}
		}
	}

	// completely spent
	if (!keyStateMini.satoshisList.length) {
		keyStateMini.hasBeenUsed = true;
	}

	let address = deltas[0]?.address;
	let keyState =
		Wallet._caches.mainnet.keysByAddress[address] ||
		Wallet._caches.testnet.keysByAddress[address];
	if (!keyState) {
		throw new Error(`address '${address}' not in addresses cache`);
	}
	Object.assign(keyState, keyStateMini);

	let usageState = Wallet._getUsageState(keyState.accountId, keyState.usage);
	Wallet._updateKeyState(usageState, keyState);

	Wallet.Addresses.set(address, keyStateMini);
};

/**
 * @param {String} address
 * @param {KeyStateMini?} [defaultValue=null]
 */
Wallet.Addresses.get = async function (address, defaultValue = null) {
	let dataJson = localStorage.getItem(`${ADDR_PRE}${address}`);
	if (dataJson === null) {
		dataJson = JSON.stringify(defaultValue);
	}

	// TODO represent coinjoin (I already forgot for what)
	let data = JSON.parse(dataJson);
	let keyStateMini = globalThis.structuredClone(Wallet._emptyKeyStateMini);
	if (data.length) {
		keyStateMini.satoshisList = data;
	} else if (data > 0) {
		keyStateMini.reservedAt = data;
	} else if (data <= 0) {
		keyStateMini.hasBeenUsed = true;
	} else {
		throw new Error(`corrupted data for '${ADDR_PRE}${address}'`);
	}

	return keyStateMini;
};

/**
 * @returns {Promise<Object.<String, KeyStateMini>>}
 */
Wallet.Addresses.all = async function () {
	const ADDR_LEN = 34;
	const KEY_LEN = ADDR_LEN + ADDR_PRE.length;

	/** @type {Object.<Number|String, KeyStateMini>} */
	let results = {};
	for (let i = 0; i < localStorage.length; i += 1) {
		if (i % 10000 === 0) {
			await thaw(10); // let event loop breathe
		}
		let key = localStorage.key(i);
		if (!key) {
			continue;
		}

		let isType = key.length === KEY_LEN && key.startsWith(ADDR_PRE);
		if (!isType) {
			continue;
		}

		let json = localStorage.getItem(key);
		if (json === null) {
			continue;
		}

		let address = key.slice(ADDR_PRE.length);
		let keyStateMiniDefault = globalThis.structuredClone(
			Wallet._emptyKeyStateMini,
		);
		let keyStateMini = await Wallet.Addresses.get(address, keyStateMiniDefault);

		results[address] = keyStateMini;
	}

	return results;
};

/**
 * @template T
 * @param {Array<T>} array
 * @returns {Array<T>}
 */
function knuthShuffle(array) {
	let currentIndex = array.length;
	let temporaryValue;

	// While there remain elements to shuffle...
	while (currentIndex > 0) {
		// Pick a remaining element...
		let randomIndex = Math.random() * currentIndex;
		randomIndex = Math.floor(randomIndex);
		currentIndex -= 1;

		// And swap it with the current element.
		temporaryValue = array[currentIndex];
		array[currentIndex] = array[randomIndex];
		array[randomIndex] = temporaryValue;
	}

	return array;
}

/**
 * Sleep, but named as to indicate we're using this to prevent from freezing up the main thread / event loop
 * @param {Number} ms
 */
async function thaw(ms) {
	return await new Promise(function (resolve) {
		setTimeout(resolve, ms);
	});
}

// Object.assign(module.exports, Wallet);
export default Wallet;
