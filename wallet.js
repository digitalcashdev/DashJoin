////@ts-expect-error
//let DashPhrase = window.DashPhrase;
//@ts-expect-error
let DashHd = window.DashHd;
//@ts-expect-error
let DashKeys = window.DashKeys;
////@ts-expect-error
//let DashTx = window.DashTx;
////@ts-expect-error
//let Secp256k1 = window.nobleSecp256k1;

/** @typedef {String} Base58Check */
/** @typedef {String} Hex */

/**
 * @typedef {KeyInfoGenerated & KeyStateMini} KeyInfo
 */

/**
 * @typedef KeyInfoGenerated
 * @prop {WalletID} walletId
 * @prop {AccountID} accountId
 * @prop {Number} account
 * @prop {Number} usage
 * @prop {Number} index
 * @prop {String} hdpath
 * @prop {Base58Check} address
 * @prop {Base58Check} wif
 * @prop {import('dashhd').HDKey} xkey
 * @prop {Uint8Array?} privateKey
 * @prop {Uint8Array} publicKey
 * @prop {Hex} pubKeyHash
 */

/**
 * @typedef KeyStateMini
 * @prop {Array<Number>} satoshisList
 * @prop {Number} reservedAt
 * @prop {Boolean} hasBeenUsed
 */

const USAGE_COINJOIN = 2;
const ROUNDS_TARGET = 16;

let Wallet = {};

/**
 * @typedef {String} WalletID
 * @typedef {String} AccountID
 * @typedef {Base58Check} Address
 */

/**
 * @typedef WalletState
 * @prop {Array<Address>} receiveUnusedSparse
 * @prop {Number} _receiveLastUnused
 * @prop {Array<Address>} changeUnusedSparse
 * @prop {Number} _changeLastUnused
 * @prop {Array<Address>} coinjoinUnusedSparse
 * @prop {Number} _coinjoinLastUnused
 */

/** @type {Object.<AccountID, WalletState>} */
Wallet._walletStates = {
	"-": {
		receiveUnusedSparse: [],
		_receiveLastUnused: 0,
		changeUnusedSparse: [],
		_changeFirstUnused: 0,
		coinjoinUnusedSparse: [],
		_coinjoinLastUnused: 0,
	},
};

/** @type {Object.<Address, KeyInfo>} */
Wallet._spendable = {};

/** @type {Object.<Address, KeyInfo>} */
Wallet._unused = {};

/** @type {Object.<AccountID, Array<import('dashhd').HDKey>>} */
Wallet._coinjoinXPrvs = {};

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
 * @param {import('dashhd').HDAccount} accountKey
 * @param {Address} address
 */
Wallet.getCoinJoinAddressFor = async function (network, accountKey, address) {
	let accountId = await DashHd.toId(accountKey);
	let prevInfo = Wallet.Addresses._cache[address];

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

	let usageRound = prevInfo.usage - USAGE_COINJOIN;
	if (usageRound >= ROUNDS_TARGET) {
		let msg = `${address} has already been through ${ROUNDS_TARGET} CoinJoin rounds`;
		let err = new Error(msg);
		Object.assign(err, { code: "E_COINJOIN_MAX_ROUNDS" });
		throw err;
	}

	if (usageRound >= 0) {
		if (prevInfo.accountId !== accountId) {
			let msg = `'${address}' is already in round ${usageRound} of CoinJoin in wallet ${prevInfo.walletId}'s account ${prevInfo.accountId}`;
			let err = new Error(msg);
			Object.assign(err, { code: "E_COINJOIN_IN_OTHER_WALLET" });
			throw err;
		}
	}

	let index = prevInfo.index;
	if (usageRound < 0) {
		// index = _reserveNextUnusedCJIndex();
		throw new Error("denomination address not implemented");
	}

	let xprvKey = await Wallet._getXPrv(accountKey, accountId, usageRound);
	let addressKey = await xprvKey.deriveAddressKey(prevInfo.index);

	let genInfo = await Wallet._rawGetKeyInfo(
		network,
		prevInfo.walletId,
		accountId,
		accountKey.index,
		usageRound,
		index,
		addressKey,
	);
	let nextInfo = Wallet._mergeKeyInfo(genInfo);
	return nextInfo.address;
};

/**
 * @param {KeyInfoGenerated} genInfo
 */
Wallet._mergeKeyInfo = function (genInfo) {
	let _cacheInfo = Wallet.Addresses._cache[genInfo.address] || {};
	Wallet.Addresses._cache[genInfo.address] = Object.assign(_cacheInfo, genInfo);
	return _cacheInfo;
};

/**
 * @param {import('dashhd').HDAccount} accountKey
 * @param {AccountID} accountId
 * @param {Number} usage
 */
Wallet._getXPrv = async function (accountKey, accountId, usage) {
	// TODO XXX place accountId on accountKey canonically in DashHD
	// https://github.com/dashhive/DashHD.js/issues/40

	let xprvKeys = Wallet._coinjoinXPrvs[accountId];
	if (!xprvKeys) {
		Wallet._coinjoinXPrvs[accountId] = [];
	}

	let xprvKey = xprvKeys[usage];
	if (!xprvKey) {
		xprvKey = await accountKey.deriveXKey(usage);
		xprvKeys[usage] = xprvKey;
	}

	return xprvKey;
};

/**
 * Get (offline-cached) list of unused receive addresses
 * @param {String} network - "mainnet" or "testnet"
 * @param {import('dashhd').HDWallet} walletKey
 * @param {Number} accountIndex
 * @param {Number} usage - 0 receive, 1 change, 2-16 coinjoin
 * @param {Number} [offset] - the index to start from, or 0
 * @param {Number} [limit=100] - get addresses from offset to offset + N-1, ex: 0-99
 */
Wallet.getKeyInfos = async function (
	network,
	walletKey,
	accountIndex,
	usage,
	offset = 0,
	limit = 100,
) {
	let keyInfos = await Wallet.rawGetKeyInfos(
		network,
		walletKey,
		accountIndex,
		usage,
		offset,
		limit,
	);

	for (let _keyInfo of keyInfos) {
		let keyInfo = Wallet._mergeKeyInfo(_keyInfo);

		if (keyInfo.satoshisList) {
			// TODO if this is reused, it must be handled differently
			Wallet._spendable[keyInfo.address] = keyInfo;
		} else if (keyInfo.hasBeenUsed) {
			// do nothing
		} else if (keyInfo.reservedAt) {
			// TODO check if reservation is expired
			// also we need two types of reservations:
			// - external "made public at"
			// - internal "reserved at"
			// anything public (i.e. shared via QR, email, etc) should be considered spent
		} else {
			let accountState = Wallet._walletStates[keyInfo.accountId];
			if (usage === DashHd.RECEIVE) {
				accountState.receiveUnusedSparse[keyInfo.index] = keyInfo;
				// accountState.receiveLastUnused = keyInfo.index;
			} else {
				accountState.changeUnusedSparse[keyInfo.index] = keyInfo;
				// accountState.changeLastUnused = keyInfo.index;
			}
			Wallet._unused[keyInfo.address] = keyInfo;
		}
	}

	return keyInfos;
};

/**
 * Get (offline-cached) list of unused receive addresses
 * @param {String} network - "mainnet" or "testnet"
 * @param {import('dashhd').HDWallet} walletKey
 * @param {Number} accountIndex
 * @param {Number} usage - 0 receive, 1 change, 2-16 coinjoin
 * @param {Number} [offset] - the index to start from, or 0
 * @param {Number} [limit=100] - get addresses from offset to offset + N-1, ex: 0-99
 */
Wallet.rawGetKeyInfos = async function (
	network,
	walletKey,
	accountIndex,
	usage,
	offset = 0,
	limit = 100,
) {
	let walletId = await DashHd.toId(walletKey);

	let accountKey = await walletKey.deriveAccount(accountIndex);
	/** @type {AccountID} */
	let accountId = await DashHd.toId(accountKey);

	// let usage = DashHd.RECEIVE;
	let xprvKey = await accountKey.deriveXKey(usage);

	let keyInfos = [];
	let end = offset + limit;
	for (let index = offset; index < end; index += 1) {
		let addressKey;
		try {
			addressKey = await xprvKey.deriveAddress(index);
		} catch (e) {
			end += 1; // to make up for skipping on error
			continue;
		}

		let keyInfo = await Wallet._rawGetKeyInfo(
			network,
			walletId,
			accountId,
			accountIndex,
			usage,
			index,
			addressKey,
		);
		keyInfos.push(keyInfo);
	}

	return keyInfos;
};

/**
 * @param {String} network - mainnet, testnet
 * @param {String} walletId
 * @param {AccountID} accountId
 * @param {Number} accountIndex
 * @param {Number} usage
 * @param {Number} index
 * @param {import('dashhd').HDKey} addressKey
 * @returns {Promise<KeyInfoGenerated>}
 */
Wallet._rawGetKeyInfo = async function (
	network,
	walletId,
	accountId,
	accountIndex,
	usage,
	index,
	addressKey,
) {
	let validUsage = usage >= 0 && usage <= 16;
	if (!validUsage) {
		let err = new Error(`unknown usage '${usage}'`);
		throw err;
	}

	let wif = await DashHd.toWif(addressKey.privateKey, {
		version: network,
	});
	let address = await DashHd.toAddr(addressKey.publicKey, {
		version: network,
	});

	let coinType = 5;
	if (network !== "mainnet") {
		coinType = 1;
	}
	let hdpath = `m/44'/${coinType}'/${accountIndex}'/${usage}`;

	let pkhBytes = await DashKeys.pubkeyToPkh(addressKey.publicKey);
	let keyInfo = {
		walletId: walletId,
		accountId: accountId,
		account: accountIndex,
		usage: usage,
		index: index,
		hdpath: hdpath,
		address: address, // ex: XrZJJfEKRNobcuwWKTD3bDu8ou7XSWPbc9
		wif: wif, // ex: XCGKuZcKDjNhx8DaNKK4xwMMNzspaoToT6CafJAbBfQTi57buhLK
		xkey: addressKey,
		privateKey: addressKey.privateKey || null,
		publicKey: DashKeys.utils.bytesToHex(addressKey.publicKey),
		pubKeyHash: DashKeys.utils.bytesToHex(pkhBytes),
	};

	return keyInfo;
};

const ADDR_PRE = "$_";

Wallet.Addresses = {};

/** @type {Object.<String, KeyInfo>} */
Wallet.Addresses._cache = {};

/**
 * @param {String} key
 * @param {any} value
 */
Wallet.Addresses.set = async function (key, value) {
	if (value === null) {
		localStorage.removeItem(key);
		return;
	}

	let dataJson = JSON.stringify(value);
	localStorage.setItem(`${ADDR_PRE}${key}`, dataJson);
};

/**
 * @param {String} key
 * @param {any?} [defaultValue=null]
 */
Wallet.Addresses.get = async function (key, defaultValue = null) {
	let dataJson = localStorage.getItem(`${ADDR_PRE}${key}`);
	if (dataJson === null) {
		dataJson = JSON.stringify(defaultValue);
	}

	let data = JSON.parse(dataJson);
	return data;
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
			await sleep(10);
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

		// TODO represent coinjoin
		let keyState = {
			satoshisList: [],
			hasBeenUsed: false,
			reservedAt: 0,
		};
		let data = JSON.parse(json);
		if (data.length) {
			keyState.satoshisList = data;
		} else if (data > 0) {
			keyState.reservedAt = data;
		} else if (data <= 0) {
			keyState.hasBeenUsed = true;
		} else {
			throw new Error(`corrupted data for '${key}'`);
		}

		let address = key.slice(ADDR_PRE.length);
		results[address] = keyState;
	}

	return results;
};

/**
 * @param {Number} ms
 */
async function sleep(ms) {
	return await new Promise(function (resolve) {
		setTimeout(resolve, ms);
	});
}

export default Wallet;
