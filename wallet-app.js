import DashJoin from "./dashjoin.js";
import DashP2P from "./dashp2p.js";
import Wallet from "./wallet.js";

(function () {
	"use strict";
	/* jshint maxstatements: 1000 */

	//@ts-expect-error
	let QRCode = window.QRCode;

	/** @typedef {HTMLElement & HTMLInputElement & HTMLAnchorElement & HTMLTemplateElement} HTMLOmniElement */

	/**
	 * @param {String} sel
	 * @param {HTMLElement | DocumentFragment} [el]
	 * @return {HTMLElement & HTMLInputElement & HTMLAnchorElement & HTMLTemplateElement}
	 */
	function $(sel, el) {
		let $el = (el || document).querySelector(sel);
		if (!$el) {
			throw new Error(`selector '${sel}' selected no element`);
		}

		//@ts-expect-error
		return $el;
	}

	/**
	 * @param {String} sel
	 * @param {HTMLElement} [el]
	 * @return {Array<HTMLElement & HTMLInputElement & HTMLAnchorElement & HTMLTemplateElement>}
	 */
	function $$(sel, el) {
		let $els = Array.from((el || document).querySelectorAll(sel));
		// if ($els.length === 0) {
		// 	throw new Error(`selector '${sel}' selected no elements`);
		// }

		//@ts-expect-error
		return $els;
	}

	/**
	 * An evenly-distributed randomizer algo for crypto- and pseudo-random sorts
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

	//@ts-expect-error
	let DashPhrase = window.DashPhrase;
	//@ts-expect-error
	let DashHd = window.DashHd;
	//@ts-expect-error
	let DashKeys = window.DashKeys;
	//@ts-expect-error
	let DashTx = window.DashTx;
	//@ts-expect-error
	let Secp256k1 = window.nobleSecp256k1;

	let App = {};
	//@ts-expect-error
	window.App = App;

	let P2P = {};
	//@ts-expect-error
	window.P2P = P2P;

	let Tools = {};
	//@ts-expect-error
	window.Tools = Tools;

	const SATS = 100000000;
	const MIN_BALANCE = 100001 * 5;

	/**
	 * @typedef DeltaInfo
	 * @prop {Number} balance
	 * @prop {Array<CoinDelta>} deltas
	 */

	/** @typedef {RPCDelta & CoinDeltaPartial &FullCoinPartial} FullCoin */
	/**
	 * @typedef FullCoinPartial
	 * @prop {Number} outputIndex
	 * @prop {Hex} publicKey
	 * @prop {Hex} pubKeyHash
	 */

	/** @typedef {RPCDelta & CoinDeltaPartial} CoinDelta */
	/**
	 * @typedef CoinDeltaPartial
	 * @prop {Number} reserved - Date.now()
	 * @prop {Number} denom
	 * @prop {Number} [rounds] - typically 16
	 */

	// Ex: https://trpc.digitalcash.dev/#?method=getaddressdeltas&params=[{%22addresses%22:[%22yN5NEJLnqahrgLhTdRdKzg6hu2CbxdiVUQ%22]}]&submit
	//
	/**
	 * RPC Response for 'getaddressdeltas' and 'getaddressmempool'
	 * @typedef RPCDelta
	 * @prop {String} address - 34 char base58check-encoded
	 * @prop {Uint32} blockindex - index of transaction in the block
	 * @prop {Uint32} height
	 * @prop {Uint16} index - treated as 'outputIndex' for debits
	 * @prop {Int32} satoshis - debits are negative
	 * @prop {String} txid
	 */

	const MAINNET = "mainnet";
	const COINTYPE_DASH = 5;
	const COINTYPE_TESTNET = 1; // testnet (for all coins)

	App.network = MAINNET;

	App.dbPrefix = "";
	App.customRpcUrl = "";
	App.customP2pUrl = "";

	let sessionSeedBytes = new Uint8Array(0);
	let sessionPhrase = "";
	let sessionSalt = "";

	let session = {};

	session.accountIndex = 0;
	session.cjAccountIndex = 0;
	// session.coinjoinIndex = 0;
	session.mainnet = {
		/** @type {import('dashhd').HDWallet} */ //@ts-expect-error
		walletKey: null,
		walletId: "",
		/** @type {import('./wallet.js').AccountInfo} */ //@ts-expect-error
		cjAccountInfo: null,
		/** @type {import('./wallet.js').AccountInfo} */ //@ts-expect-error
		accountInfo: null,
		accountId: "",
		/** @type {import('./wallet.js').XKeyInfo} */ //@ts-expect-error
		receiveKeyInfo: null,
		/** @type {import('./wallet.js').XKeyInfo} */ //@ts-expect-error
		changeKeyInfo: null,
		/** @type {import('./wallet.js').XKeyInfo} */ //@ts-expect-error
		denomKeyInfo: null,
	};
	session.testnet = {
		/** @type {import('dashhd').HDWallet} */ //@ts-expect-error
		walletKey: null,
		walletId: "",
		/** @type {import('./wallet.js').AccountInfo} */ //@ts-expect-error
		cjAccountInfo: null,
		/** @type {import('./wallet.js').AccountInfo} */ //@ts-expect-error
		accountInfo: null,
		accountId: "",
		/** @type {import('./wallet.js').XKeyInfo} */ //@ts-expect-error
		receiveKeyInfo: null,
		/** @type {import('./wallet.js').XKeyInfo} */ //@ts-expect-error
		changeKeyInfo: null,
		/** @type {import('./wallet.js').XKeyInfo} */ //@ts-expect-error
		denomKeyInfo: null,
	};
	let currentSession = session.mainnet;

	session._minAddressSelectionPool = 10;

	/**
	 * Select count at random from a given pool
	 * @param {Number} count
	 * @param {Number} [poolSize] - pass poolSize to takeUnusedKeys
	 */
	session.takeChangeAddresses = async function (count, poolSize) {
		let keyStates = await Wallet.takeUnusedKeys(
			currentSession.changeKeyInfo,
			count,
			poolSize,
		);

		/** @type {Array<String>} */
		let changeAddresses = [];
		for (let keyState of keyStates) {
			changeAddresses.push(keyState.address);
		}

		return changeAddresses;
	};
	session.takeChangeAddress = async function () {
		let addresses = await session.takeChangeAddresses(1, 1);
		let address = addresses[0];
		return address;
	};

	App.__DANGEROUS_showSecrets = async function () {
		return {
			seedBytes: sessionSeedBytes,
			phrase: sessionPhrase,
			salt: sessionSalt,
			current: currentSession,
			mainnet: session.mainnet,
			testnet: session.testnet,
		};
	};

	// /** @type {Array<String>} */
	// let addresses = [];
	// /** @type {Array<String>} */
	// let changeAddrs = [];
	// /** @type {Array<String>} */
	// let receiveAddrs = [];
	// /** @type {Array<String>} */
	// let spentAddrs = [];
	// /** @type {Array<String>} */
	// let spendableAddrs = [];

	/** @type {Object.<String, DeltaInfo>} */
	let deltasMap = {};
	// /** @type {Object.<String, KeyInfo>} */
	// let keysMap = {};
	/** @type {Object.<Number, Object.<String, CoinDelta>>} */
	let denomsMap = {};

	/** @type {Object.<String, Boolean>} */
	let foreignAddresses = {};

	/**
	 * @typedef KeyInfo
	 * @prop {String} walletId
	 * @prop {Number} i
	 * @prop {String} hdpath
	 * @prop {String} address
	 * @prop {String} wif
	 * @prop {import('dashhd').HDKey} key
	 * @prop {Hex} publicKey
	 * @prop {Hex} pubKeyHash
	 */

	/**
	 * @typedef QueueInfo
	 * @prop {Object.<Hostname, Date>} reportedBy
	 * @prop {Masternode} hostnode
	 * @prop {ReturnType<typeof DashJoin.parsers.dsq>} dsq
	 * @prop {Number} broadcastAt - ms
	 * @prop {Number} expiresAt - ms
	 */
	/** @type {Object.<Number, QueueInfo>} */
	let emptyCoinjoinQueues = {
		100001: {}, //      0.00100001
		1000010: {}, //     0.01000010
		10000100: {}, //    0.10000100
		100001000: {}, //   1.00001000
		1000010000: {}, // 10.00010000
	};

	/**
	 * @typedef ChainInfo
	 * @prop {Number} blocks
	 */

	/**
	 * @typedef NetworkInfo
	 * @prop {String} network
	 * @prop {String} dbPrefix
	 * @prop {Number} purpose - 44 for BIP-44
	 * @prop {Number} coinType - 5 for DASH, 1 for testnet (all coins)
	 * @prop {import('dashhd').HDVersions} hdVersions - xprv/xpub or tprv/tpub
	 * @prop {Number} maxConns
	 * @prop {Number} defaultRounds - how many coinjoins to do
	 * @prop {Boolean} initialized
	 * @prop {Object.<Number, QueueInfo>} coinjoinQueues
	 * @prop {Object.<String, Masternode>} masternodelist
	 * @prop {Object.<String, Masternode>} nodesByProTxHash
	 * @prop {Object.<String, Masternode>} nodesByHost
	 * @prop {Number} startHeight
	 * @prop {ChainInfo} _chaininfo
	 * @prop {Object.<String, PeerInfo>} peers
	 * @prop {String} rpcExplorer
	 * @prop {String} rpcBaseUrl
	 * @prop {String} p2pWebProxyUrl
	 */

	/**
	 * @typedef PeerInfo
	 * @prop {ReturnType<typeof DashP2P.create>} p2p
	 * @prop {Date} connectedAt
	 * @prop {Date} latestAt
	 * @prop {MasternodeShort} node
	 */

	/** @type {NetworkInfo} */
	App.mainnet = {
		network: "mainnet",
		purpose: 44,
		coinType: COINTYPE_DASH,
		hdVersions: DashHd.MAINNET,
		dbPrefix: "",
		maxConns: 3,
		defaultRounds: 16,
		initialized: false,
		coinjoinQueues: globalThis.structuredClone(emptyCoinjoinQueues),
		masternodelist: {},
		startHeight: 0,
		_chaininfo: {
			blocks: 0, // height
		},
		nodesByProTxHash: {},
		nodesByHost: {},
		peers: {},
		rpcExplorer: "https://rpc.digitalcash.dev/",
		rpcBaseUrl: `https://api:null@rpc.digitalcash.dev/`,
		p2pWebProxyUrl: "wss://p2p.digitalcash.dev/ws",
	};

	/** @type {NetworkInfo} */
	App.testnet = {
		network: "testnet",
		purpose: 44,
		coinType: COINTYPE_TESTNET,
		hdVersions: DashHd.TESTNET,
		dbPrefix: "testnet-",
		maxConns: 3,
		defaultRounds: 3,
		initialized: false,
		coinjoinQueues: globalThis.structuredClone(emptyCoinjoinQueues),
		masternodelist: {},
		startHeight: 0,
		_chaininfo: {
			blocks: 0, // height
		},
		nodesByProTxHash: {},
		nodesByHost: {},
		peers: {},
		rpcExplorer: "https://trpc.digitalcash.dev/",
		rpcBaseUrl: `https://api:null@trpc.digitalcash.dev/`,
		p2pWebProxyUrl: "wss://tp2p.digitalcash.dev/ws",
	};

	App.currentNetwork = App.mainnet;

	/**
	 * @typedef SessionInfo
	 * @prop {String} host - hostname:port
	 * @prop {String} address - hostname:port
	 * @prop {Array<Partial<import('dashtx').TxInputForSig>>} inputs
	 * @prop {Number} denomination
	 * @prop {String} dssu - dssu.state
	 * @prop {Date} dsa
	 * @prop {Date} dsq - only if ready flag is set
	 * @prop {Date} dsi
	 * @prop {Date} dsf
	 * @prop {Date} dss
	 * @prop {Date} dsc
	 */

	/** @typedef {String} Hostname */
	/** @type {Object.<Hostname, SessionInfo>} */
	App.sessions = {};

	let keyUtils = {
		/**
		 * @param {Partial<import('dashtx').TxInputForSig>} txInput
		 * @param {Number} [i]
		 */
		getPrivateKey: async function (txInput, i) {
			// let address;
			let address = txInput.address;
			if (!address) {
				return null;
				// let pkhBytes = DashKeys.utils.hexToBytes(txInput.pubKeyHash);
				// address = await DashKeys.pkhToAddr(pkhBytes, { version: App.currentNetwork.network });
			}

			let keyState = Wallet.getKeyStateByAddress(
				App.currentNetwork.network,
				address,
			);
			// return keyState.privateKey;

			// if (!keyState.privateKey) {
			let privKeyBytes = await DashKeys.wifToPrivKey(keyState.wif, {
				version: App.currentNetwork.network,
			});
			return privKeyBytes;
			// }
		},

		/**
		 * @param {Partial<import('dashtx').TxInputForSig>} txInput
		 * @param {Number} [i]
		 */
		getPublicKey: async function (txInput, i) {
			let privKeyBytes = await keyUtils.getPrivateKey(txInput, i);
			let pubKeyBytes = await keyUtils.toPublicKey(privKeyBytes);

			return pubKeyBytes;
		},
		// TODO
		// toPkh: DashKeys.pubkeyToPkh,

		/**
		 * @param {Uint8Array} privKeyBytes
		 * @param {Uint8Array} txHashBytes
		 */
		sign: async function (privKeyBytes, txHashBytes) {
			let sigOpts = { canonical: true, extraEntropy: true };
			let sigBytes = await Secp256k1.sign(txHashBytes, privKeyBytes, sigOpts);

			return sigBytes;
		},

		/**
		 * @param {Uint8Array} privKeyBytes
		 */
		toPublicKey: async function (privKeyBytes) {
			let isCompressed = true;
			let pubKeyBytes = Secp256k1.getPublicKey(privKeyBytes, isCompressed);

			return pubKeyBytes;
		},
	};
	let dashTx = DashTx.create(keyUtils);
	console.log("DEBUG dashTx instance", dashTx);

	/**
	 * @param {String} key
	 * @param {any?} [defVal]
	 */
	function dbGet(key, defVal) {
		let dataJson = localStorage.getItem(key);
		if (!dataJson) {
			dataJson = JSON.stringify(defVal);
		}

		let data;
		try {
			data = JSON.parse(dataJson);
		} catch (e) {
			data = defVal;
		}
		return data;
	}

	/**
	 * @param {String} key
	 * @param {any} val
	 */
	function dbSet(key, val) {
		if (val === null) {
			localStorage.removeItem(key);
			return;
		}

		let dataJson = JSON.stringify(val);
		localStorage.setItem(key, dataJson);
	}

	/**
	 * @param {Object} [opts]
	 * @param {Boolean} [opts.denom]
	 * @param {Boolean} [opts.coinjoin]
	 * @returns {Array<FullCoin>}
	 */
	function getAllUtxos(opts) {
		let utxos = [];
		let spendableAddrs = Object.keys(deltasMap);
		for (let address of spendableAddrs) {
			let keyState = Wallet.getKeyStateByAddress(
				App.currentNetwork.network,
				address,
			);
			if (!keyState) {
				continue;
			}

			let isCoinJoinLocked =
				keyState.usage !== Wallet.USAGE_RECEIVE &&
				keyState.usage !== Wallet.USAGE_CHANGE;
			if (isCoinJoinLocked && !opts?.coinjoin) {
				continue;
			} else if (!isCoinJoinLocked && opts?.coinjoin) {
				continue;
			}

			/** @type {DeltaInfo} */
			let info = deltasMap[address];
			info.balance = DashTx.sum(info.deltas);

			for (let coinDelta of info.deltas) {
				let coin = toFullCoin(keyState, coinDelta);

				if (coin.reserved > 0) {
					continue;
				}

				if (opts?.denom === false) {
					if (coin.denom) {
						continue;
					}
				}

				if (info.balance === 0) {
					break;
				}
				utxos.push(coin);
			}
		}

		return utxos;
	}

	/**
	 * @param {import('./wallet.js').KeyState} keyState
	 * @param {CoinDelta} coinDelta
	 * @returns {FullCoin}
	 */
	function toFullCoin(keyState, coinDelta) {
		let fullCoin = Object.assign(coinDelta, {
			outputIndex: coinDelta.index,
			denom: DashJoin.getDenom(coinDelta.satoshis),
			publicKey: keyState.publicKey,
			pubKeyHash: keyState.pubKeyHash,
		});
		return fullCoin;
	}

	/**
	 * @template T
	 * @param {Array<T>} arr
	 * @param {T} val
	 */
	function removeElement(arr, val) {
		let index = arr.indexOf(val);
		if (index !== -1) {
			arr.splice(index, 1);
		}
	}

	/**
	 * @param {String} method
	 * @param {...any} params
	 */
	App.rpc = async function (method, ...params) {
		let rpcBaseUrl = App.customRpcUrl;
		if (rpcBaseUrl.length === 0) {
			rpcBaseUrl = App.currentNetwork.rpcBaseUrl;
		}

		let result = await DashTx.utils.rpc(rpcBaseUrl, method, ...params);
		return result;
	};

	/** @param {"mainnet"|"testnet"|String} network */
	App.$setNetwork = async function (network) {
		await dbSet("network", network);

		await App.$init(network);
		await App.initP2p();
	};

	/** @param {String} maxConnStr */
	App.$setMaxConn = async function (maxConnStr) {
		let maxConn = parseInt(maxConnStr, 10);
		if (!maxConn) {
			throw new Error(`invalid maximum connections '${maxConnStr}'`);
		}

		await dbSet(`max-connections`, maxConn);
		await dbSet(`testnet-max-connections`, maxConn);

		await App.initP2p();
	};

	/** @param {String} defaultRoundsStr */
	App.$setDefaultRounds = async function (defaultRoundsStr) {
		let newDefaultRounds = parseInt(defaultRoundsStr, 10);
		console.log(
			`DEBUG rounds '${defaultRoundsStr}' vs '${App.currentNetwork.defaultRounds}'`,
		);
		if (!newDefaultRounds) {
			return;
		}

		let $targets = $$(`input[name="targetRounds"]`);
		for (let $target of $targets) {
			let rounds = parseInt($target.value, 10);
			if (rounds === App.currentNetwork.defaultRounds) {
				$target.value = newDefaultRounds.toString();
			}
		}
		App.currentNetwork.defaultRounds = newDefaultRounds;
	};

	App.$updateRpcUrl = async function () {
		// TODO save to db (and restore on init)

		//@ts-expect-error
		let customRpcUrl = document.querySelector("[name=rpcUrl]").value;

		let canParse = URL.canParse(customRpcUrl);
		if (!canParse) {
			App.customRpcUrl = "";
			return;
		}
		App.customRpcUrl = customRpcUrl;
	};

	App.$updateP2pUrl = async function () {
		// TODO save to db (and restore on init)

		//@ts-expect-error
		let customP2pUrl = document.querySelector("[name=p2pUrl]").value;

		let canParse = URL.canParse(customP2pUrl);
		if (!canParse) {
			App.customP2pUrl = "";
			return;
		}
		App.customP2pUrl = customP2pUrl;
	};

	/**
	 * @param {String} phrase
	 * @param {String} salt
	 * @param {Number} accountIndex
	 */
	App.$saveWallet = async function (phrase, salt, accountIndex) {
		await DashPhrase.verify(phrase); // possible error here

		$('[data-id="wallet-status"]').textContent = "";
		setTimeout(async function () {
			$('[data-id="wallet-status"]').textContent = "updating...";
		}, 100);
		setTimeout(function () {
			$('[data-id="wallet-status"]').textContent = "updated";
		}, 550);
		setTimeout(function () {
			$('[data-id="wallet-status"]').textContent = "";
		}, 1500);

		sessionPhrase = phrase;
		sessionSalt = salt || "";
		await App.$init(App.currentNetwork.network); // error shouldn't be possible here
		let phrases = dbGet(`${App.currentNetwork.dbPrefix}wallet-phrases`, []);
		for (;;) {
			let hasPhrase = phrases.includes(phrase);
			if (!hasPhrase) {
				break;
			}
			removeElement(phrases, phrase);
		}
		phrases.unshift(phrase);
		dbSet(`${App.currentNetwork.dbPrefix}wallet-phrases`, phrases);
		dbSet(`wallet-${currentSession.walletId}-account-index`, accountIndex);
	};

	/**
	 * @param {String} phrase
	 * @param {Hex} seedHex
	 * @param {Number} primaryAccount - 0 (typical primary)
	 * @param {Number} coinjoinAccount - 1 (above primary)
	 * @param {Number} firstRoundIndex - 2 (above receive/change)
	 */
	App._$renderWalletSettings = async function (
		phrase,
		seedHex,
		primaryAccount = 0,
		coinjoinAccount = 0,
		firstRoundIndex = Wallet.USAGE_COINJOIN,
	) {
		$('[name="walletPhrase"]').value = phrase;
		$('[name="walletSeed"]').value = seedHex;

		$('[name="primaryAccount"]').value = primaryAccount.toString();
		$("[data-id=primary-path]").value =
			`m/44'/${App.currentNetwork.coinType}'/${primaryAccount}'`;

		$('[name="coinjoinAccount"]').value = coinjoinAccount.toString();
		$("[data-id=coinjoin-path]").value =
			`m/44'/${App.currentNetwork.coinType}'/${coinjoinAccount}'/${firstRoundIndex}`;

		// $('[name="walletPhrase"]').type = "password"; // delayed to avoid pw prompt
		// $('[name="walletSeed"]').type = "password"; // delayed to avoid pw prompt
		// $('[name="phraseSalt"]').type = "password"; // delayed to avoid pw prompt
	};

	/**
	 * @param {Number} lastReceiveIndex
	 * @param {Number} lastChangeIndex
	 */
	App._walletDerive = async function (
		lastReceiveIndex = 0,
		lastChangeIndex = 0,
	) {
		// TODO Prioritize checking on init
		// - spendable keys first
		// - unused receive keys next
		// - unused change & coinjoin keys

		// /** @type {Object.<String, import('./wallet.js').KeyState>} */
		// let verifiedUnused = {};
		// let checkableAddrs = [];

		let usages = [
			{ usage: Wallet.USAGE_RECEIVE, count: 100 },
			{ usage: Wallet.USAGE_CHANGE, count: 100 },
			{ usage: Wallet.USAGE_COINJOIN, count: 300 },
		];
		for (let u of usages) {
			let usageKeyInfo = await Wallet.rawGetUsageKey(
				App.currentNetwork.network,
				currentSession.walletKey,
				session.accountIndex,
				u.usage,
			);
			if (u.usage === Wallet.USAGE_RECEIVE) {
				currentSession.receiveKeyInfo = usageKeyInfo;
				console.log(`DEBUG CURRENT SESSION ASSIGNED`, currentSession);
			} else if (u.usage === Wallet.USAGE_CHANGE) {
				currentSession.changeKeyInfo = usageKeyInfo;
			} else if (u.usage === Wallet.USAGE_COINJOIN) {
				currentSession.denomKeyInfo = usageKeyInfo;
			} else {
				// ignore for now
			}
			console.log(
				`DEBUG USAGE_KEY_INFO`,
				App.currentNetwork.coinType,
				usageKeyInfo,
			);

			void (await Wallet.peekUnusedKeys(usageKeyInfo, u.count));
			// let keyStates = await Wallet.peekUnusedKeys(usageKeyInfo, u.count);
			// for (let keyState of keyStates) {
			// 	if (!verifiedUnused[keyState.address]) {
			// 		checkableAddrs.push(keyState.address);
			// 	}
			// }
		}
	};

	/** @param {String} address */
	App.$checkLoadBalance = async function (address) {
		setTimeout(function () {
			$('[data-id="load-dash-dust"]').textContent = "checking...";
		}, 100);
		setTimeout(async function () {
			await App.$updateDeltas([address]);
		}, 350);
	};

	/** @param {Array<String>} addresses */
	App.$updateDeltas = async function (addresses) {
		await updateDeltas(addresses);
		renderAddresses();
		renderCoins();
	};

	/**
	 * @param {import('dashtx').TxSummary} signedTx
	 */
	App._$commitWalletTx = async function (signedTx) {
		let txid = await App.rpc("sendrawtransaction", signedTx.transaction);

		await commitWalletTx(signedTx);
		renderAddresses();
		renderCoins();

		return txid;
	};

	/**
	 * @param {Number} balance
	 * @returns [String, String] - DASH, dust
	 */
	App._splitBalance = function (balance) {
		let dashF = balance / DashTx.SATOSHIS;
		let dashAmount = dashF.toFixed(3);
		let dust = balance % 100000;
		let dustAmount = dust.toString();
		dustAmount = dustAmount.padStart(5, "0");

		return [dashAmount, dustAmount];
	};

	/** @param {Event} event */
	App.toggleAll = function (event) {
		//@ts-expect-error
		let checked = event?.target?.checked || false;

		//@ts-expect-error
		let $table = event.target.closest("table");
		for (let $input of $$("[type=checkbox]", $table)) {
			$input.checked = checked;
		}
		return true;
	};

	/**
	 * @param {Event} event
	 */
	App.setMax = function (event) {
		let totalSats = 0;
		let addrs = Object.keys(deltasMap);
		let fee = 100;
		for (let addr of addrs) {
			let info = deltasMap[addr];
			if (info.balance === 0) {
				continue;
			}
			let keyState = Wallet.getKeyStateByAddress(
				App.currentNetwork.network,
				addr,
			);
			if (keyState.network !== App.currentNetwork.network) {
				console.log(`DEBUG keyState`, keyState);
				continue;
			}
			if (
				keyState.usage !== Wallet.USAGE_RECEIVE &&
				keyState.usage !== Wallet.USAGE_CHANGE
			) {
				continue;
			}
			for (let delta of info.deltas) {
				totalSats += delta.satoshis;
				fee += 100;
			}
		}

		totalSats -= fee;
		const FOUR_ZEROS = 10000;
		let sigDigits = Math.floor(totalSats / FOUR_ZEROS);
		let totalSigSats = sigDigits * FOUR_ZEROS;
		let totalAmount = totalSigSats / SATS;
		let dust = totalSats - totalSigSats;
		dust += fee;

		$("[data-id=send-amount]").value = toFixed(totalAmount, 4);
		//$('[data-id=send-dust]').value = dust;
		$("[data-id=send-dust]").textContent = dust.toString();
	};

	/**
	 * @param {Event} event
	 */
	App.$sendDash = async function (event) {
		event.preventDefault();

		let amountStr = $("[data-id=send-amount]").value || "0";
		let amount = parseFloat(amountStr);

		let addressList = $("[data-id=send-address]").value.trim();
		let addresses = addressList.split(/[\s,]/);
		addresses = addresses.filter(Boolean);
		if (!addresses.length) {
			let err = new Error(`missing payment 'address' to send funds to`);
			throw err;
		}
		for (let address of addresses) {
			let keyState = Wallet.getKeyStateByAddress(
				App.currentNetwork.network,
				address,
			);
			if (!keyState) {
				foreignAddresses[address] = true;
			}
		}

		amount *= addresses.length;
		let satoshis = Math.round(amount * SATS);
		let balance = 0;

		/** @type {Array<FullCoin>?} */
		let inputs = null;
		/** @type {Array<FullCoin>?} */
		let utxos = null;

		/** @type {Array<HTMLInputElement>} */ //@ts-expect-error
		let $coins = document.querySelectorAll("input[data-name=coin]:checked");
		if ($coins.length) {
			inputs = [];
			for (let $coin of $coins) {
				let [address, txid, indexStr] = $coin.value.split(",");
				let index = parseInt(indexStr, 10);
				let deltaInfo = deltasMap[address];
				let _coin = selectCoin(deltaInfo, txid, index);
				let coin = Object.assign(_coin, { outputIndex: _coin.index });
				//@ts-expect-error TODO
				inputs.push(coin);
			}
			balance = DashTx.sum(inputs);
		} else {
			utxos = getAllUtxos();
			balance = DashTx.sum(utxos);
		}

		if (balance < satoshis) {
			// there's a helper for this in DashTx, including fee calc,
			// but this is quick-n-dirty just to get an alert rather than
			// checking error types and translating cthe error message
			let available = balance / SATS;
			let availableStr = toFixed(available, 4);
			let err = new Error(
				`requested to send '${amountStr}' when only '${availableStr}' is available`,
			);
			throw err;
		}

		console.log("DEBUG Payment Addresses:", addresses);
		console.log("DEBUG Available coins:", utxos?.length || inputs?.length);
		console.log("DEBUG Available balance:", balance);
		console.log("DEBUG Amount:", amount * addresses.length);

		let friendlyAmount = 0;
		/** @type {import('dashtx').TxInfoSigned} */ //@ts-expect-error
		let signedTx = null;
		if (addresses.length === 1) {
			let address = addresses[0];
			let output = { satoshis, address };

			/** @type {import('dashtx').TxDraft} */ //@ts-expect-error
			let draftTx = null;
			if (inputs) {
				if (0 === satoshis) {
					draftTx = await draftFullBalanceTransfer(inputs, output);
				} else {
					draftTx = await draftPayWithAllAndReturnChange(inputs, output);
				}
			} else if (utxos) {
				draftTx = await draftPayWithSomeAndReturnChange(utxos, output);
			} else {
				throw new Error(`type fail: neither 'inputs' nor 'utxos' is set`);
			}
			let draft = await completeAndSortDraft(draftTx);
			friendlyAmount = output.satoshis / SATS;
			signedTx = await dashTx.legacy.finalizePresorted(draft.tx);
		} else {
			let coins = utxos;
			if (inputs) {
				coins = inputs;
			} else {
				if (!satoshis) {
					throw new Error("you must select inputs or specify an amount");
				}
			}

			if (!satoshis) {
				satoshis = balance / addresses.length;
			} else {
				satoshis = satoshis / addresses.length;
			}
			satoshis = Math.round(satoshis);
			friendlyAmount = addresses.length * satoshis;
			friendlyAmount = friendlyAmount / SATS;

			let outputs = [];
			for (let address of addresses) {
				let pkhBytes = await DashKeys.addrToPkh(address, {
					version: App.currentNetwork.network,
				});
				let pubKeyHash = DashKeys.utils.bytesToHex(pkhBytes);
				let output = { satoshis, address, pubKeyHash };
				outputs.push(output);
			}

			let changeAddress = await session.takeChangeAddress();
			let pkhBytes = await DashKeys.addrToPkh(changeAddress, {
				version: App.currentNetwork.network,
			});
			let pubKeyHash = DashKeys.utils.bytesToHex(pkhBytes);
			let changeOutput = {
				address: changeAddress,
				pubKeyHash: pubKeyHash,
			};

			let draftTx = DashTx.createLegacyTx(coins, outputs, changeOutput);
			signedTx = await App._finalizeSortSignReserveTx(draftTx);
		}
		console.log("DEBUG signed tx", signedTx);

		let fees = DashTx.appraise(signedTx);
		$("[data-id=send-dust]").textContent = fees.max.toString();
		$("[data-id=send-amount]").textContent = toFixed(amount, 8);
		{
			let amountStr = toFixed(friendlyAmount, 4);
			let msg = `Really send ${amountStr} to ${addresses[0]}?`;
			if (addresses.length > 1) {
				msg = `Really split ${amountStr} among ${addresses.length} addresses?`;
			}
			let confirmed = window.confirm(msg);
			if (!confirmed) {
				return;
			}
		}

		/** @type {import('dashtx').TxSummary} */ //@ts-expect-error
		let summaryTx = signedTx;
		void (await App._$commitWalletTx(summaryTx));
	};

	/** @param {Event} event */
	App.$exportWif = async function (event) {
		event.preventDefault();

		let address = $("[name=exportAddress]").value;
		let privKey;
		try {
			privKey = await keyUtils.getPrivateKey({ address });
		} catch (e) {
			throw new Error(`invalid address '${address}'`);
		}
		let wif = await DashKeys.privKeyToWif(privKey, {
			version: App.currentNetwork.network,
		});

		$("[data-id=export-wif]").textContent = wif;
	};

	/** @param {Event} event */
	Tools.$sendMemo = async function (event) {
		event.preventDefault();

		let msg;

		/** @type {String?} */
		let memo = $("[name=memo]").value || "";
		/** @type {String?} */
		let message = null;
		let memoEncoding = $("[name=memo-encoding]:checked").value || "hex";
		if (memoEncoding !== "hex") {
			message = memo;
			memo = null;
		}
		let burn = 0;
		msg = memo || message;

		let changeAddress = await session.takeChangeAddress();

		let draftTx = await App._createMemoTx({
			burn,
			memo,
			message,
			changeAddress,
		});
		let signedTx = await App._finalizeSortSignReserveTx(draftTx);
		{
			let confirmed = window.confirm(
				`Really send '${memoEncoding}' memo '${msg}'?`,
			);
			if (!confirmed) {
				App._unreserveTx(signedTx);
				return;
			}
		}

		let txid = await App._$commitWalletTx(signedTx);

		$("[data-id=memo-txid]").textContent = txid;
		let link = `${App.currentNetwork.rpcExplorer}#?method=getrawtransaction&params=["${txid}",1]&submit`;
		$("[data-id=memo-link]").textContent = link;
		$("[data-id=memo-link]").href = link;
	};

	/** @param {Event} event */
	Tools.$calcMemo = async function (event) {
		event.preventDefault();

		/** @type {String?} */
		let memo = $("[name=memo]").value || "";
		/** @type {String?} */
		let message = null;
		let memoEncoding = $("[name=memo-encoding]:checked").value || "hex";
		if (memoEncoding !== "hex") {
			message = memo;
			memo = null;
		}

		let changeAddress = await session.takeChangeAddress(); // TODO peek
		let burn = 0;
		let txInfo = await App._createMemoTx({
			burn,
			memo,
			message,
			changeAddress,
		});
		// Wallet.untakeAddress(changeAddress); // TODO
		console.info(`DEBUG txInfo`, txInfo);

		let info = `version: ${txInfo.version}`;
		for (let input of txInfo.inputs) {
			let dashF = input.satoshis / DashTx.SATOSHIS;
			let dashAmount = dashF.toFixed(8);
			dashAmount = dashAmount.padStart(13, " ");
			let coinId = input.txid.slice(0, 6);
			coinId = `${coinId}:${input.outputIndex}`;
			info += `\ninput:  ${dashAmount} ${input.address} ${coinId}`;
		}
		let change = txInfo.outputs[txInfo.changeIndex];
		for (let i = 0; i < txInfo.outputs.length; i += 1) {
			let output = txInfo.outputs[i];
			if (output === change) {
				continue;
			}
			let memo = `0x${output.memo}`;
			if (output.message) {
				memo = `"${output.message}"`;
			}
			memo = memo.padEnd(34, " ");
			let dashAmount = "0.00000000".padStart(13, " ");
			info += `\noutput: ${dashAmount} ${memo} ${i}`;
		}
		if (change) {
			let dashF = change.satoshis / DashTx.SATOSHIS;
			let dashAmount = dashF.toFixed(8);
			dashAmount = dashAmount.padStart(13, " ");
			info += `\nchange: ${dashAmount} ${change.address} ${txInfo.changeIndex}`;
		}

		requestAnimationFrame(function () {
			$('[data-id="memo-coins"]').textContent = info;
		});
	};

	/**
	 * @callback CreateMemo
	 * @param {Object} opts
	 * @param {Number} [opts.burn=0]
	 * @param {String?} [opts.memo=null]
	 * @param {String?} [opts.message=null]
	 * @param {Number} [opts.collateral=0]
	 * @param {String} opts.changeAddress
	 */

	/** @type {CreateMemo} */
	App._createMemoTx = async function ({
		burn = 0,
		memo = null,
		message = null,
		collateral = 0,
		changeAddress,
	}) {
		let satoshis = burn;
		satoshis += collateral; // temporary, for fee calculations only

		let memoOutput = { satoshis, memo, message };
		let outputs = [memoOutput];
		let changeOutput = {
			address: "",
			pubKeyHash: "",
			satoshis: 0,
			reserved: 0,
		};

		let utxos = getAllUtxos({ denom: false });
		let txInfo = DashTx.createLegacyTx(utxos, outputs, changeOutput);
		console.log(`DEBUG memo txInfo`, txInfo);
		if (txInfo.changeIndex >= 0) {
			let realChange = txInfo.outputs[txInfo.changeIndex];
			realChange.address = changeAddress;
			let pkhBytes = await DashKeys.addrToPkh(realChange.address, {
				version: App.currentNetwork.network,
			});
			realChange.pubKeyHash = DashKeys.utils.bytesToHex(pkhBytes);
		}
		memoOutput.satoshis -= collateral; // adjusting for fee

		return txInfo;
	};

	/**
	 * @param {import('dashtx').TxDraft} draftTx
	 * @param {Number} [now] - date in ms
	 */
	App._finalizeSortSignReserveTx = async function (draftTx, now = Date.now()) {
		let keysByAddress = Wallet.getCachedKeysMap(App.currentNetwork.network);

		for (let input of draftTx.inputs) {
			let address = input.address || "";
			let keyState = keysByAddress[address];

			keyState.reserved = now;
			Object.assign(input, { reserved: now });
			Wallet.updateKeyState(keyState);
		}

		for (let output of draftTx.outputs) {
			let isMemo =
				typeof output.memo === "string" || typeof output.message === "string";
			if (isMemo) {
				continue;
			}

			Object.assign(output, { reserved: now });

			let address = output.address || ""; // for type checker
			let keyState = keysByAddress[address];
			if (keyState) {
				keyState.reserved = now;
				Object.assign(output, { pubKeyHash: keyState.pubKeyHash });
				Wallet.updateKeyState(keyState);
			}

			if (!output.pubKeyHash) {
				let pkhBytes = await DashKeys.addrToPkh(address, {
					version: App.currentNetwork.network,
				});
				output.pubKeyHash = DashKeys.utils.bytesToHex(pkhBytes);
			}
		}

		draftTx.inputs.sort(DashTx.sortInputs);
		draftTx.outputs.sort(DashTx.sortOutputs);

		let signedTx = await dashTx.hashAndSignAll(
			draftTx,
			// jshint bitwise: false
			DashTx.SIGHASH_ALL | DashTx.SIGHASH_ANYONECANPAY,
		);

		return signedTx;
	};

	/**
	 * @typedef MayHaveAddress
	 * @prop {String} [address]
	 */

	/**
	 * @param {Object} draftTx
	 * @param {Array<MayHaveAddress>} draftTx.inputs
	 * @param {Array<MayHaveAddress>} draftTx.outputs
	 */
	App._unreserveTx = function (draftTx) {
		let keysByAddress = Wallet.getCachedKeysMap(App.currentNetwork.network);

		for (let input of draftTx.inputs) {
			Object.assign(input, { reserved: 0 });

			let address = input.address || "";
			let keyState = keysByAddress[address];

			// TODO track how many reservations to un-pop ??
			// keyState.reservations += 1;
			// if (keyState.reservations <= 0) {
			// 	keyState.reservations = 0;
			// 	keyState.reserved = 0;
			//  Object.assign(input, { reserved: 0 });
			// }

			keyState.reserved = 0;
			Wallet.updateKeyState(keyState);
		}

		for (let output of draftTx.outputs) {
			Object.assign(output, { reserved: 0 });

			let address = output.address || ""; // for type checker
			let keyState = keysByAddress[address];
			if (keyState) {
				keyState.reserved = 0;
				Wallet.updateKeyState(keyState);
			}
		}
	};

	/**
	 * @param {Array<FullCoin>} inputs
	 * @param {import('dashtx').TxOutput} output
	 */
	async function draftFullBalanceTransfer(inputs, output) {
		if (output.satoshis !== 0) {
			throw new Error(
				"output.satoshis must be set to 0 for a full balance transfer",
			);
		}

		let draftTx = dashTx.legacy.draftSingleOutput({
			utxos: null,
			inputs: inputs,
			output: output,
		});
		return draftTx;
	}

	/**
	 * @param {Array<FullCoin>} inputs
	 * @param {import('dashtx').TxOutput} output
	 */
	async function draftPayWithAllAndReturnChange(inputs, output) {
		if (!output.satoshis) {
			throw new Error(
				"output.satoshis must be set to a specific amount to determine what change to return",
			);
		}

		let draftTx = dashTx.legacy.draftSingleOutput({
			utxos: null,
			inputs: inputs,
			output: output,
		});
		return draftTx;
	}

	/**
	 * @param {Array<FullCoin>} utxos
	 * @param {import('dashtx').TxOutput} output
	 */
	async function draftPayWithSomeAndReturnChange(utxos, output) {
		let draftTx = dashTx.legacy.draftSingleOutput({
			utxos: utxos,
			inputs: null,
			output: output,
		});
		return draftTx;
	}

	/**
	 * @param {import('dashtx').TxDraft} draftTx
	 */
	async function completeAndSortDraft(draftTx) {
		// let draftTx = await Tx.createLegacyTx(coins, outputs, changeOutput);
		// { version, inputs, outputs, changeIndex, locktime }
		// let change = txInfo.outputs[txInfo.changeIndex];
		// console.log("DEBUG draftTx", draftTx);

		let changeOutput = draftTx.outputs[1];
		if (changeOutput) {
			let address = await session.takeChangeAddress();
			changeOutput.address = address;
		}

		// See https://github.com/dashhive/DashTx.js/pull/77
		for (let input of draftTx.inputs) {
			let address = input.address || "";
			let keyState = Wallet.getKeyStateByAddress(
				App.currentNetwork.network,
				address,
			);
			Object.assign(input, {
				publicKey: keyState.publicKey, // bytes or hex?
				pubKeyHash: keyState.pubKeyHash,
			});
		}

		for (let output of draftTx.outputs) {
			if (output.pubKeyHash) {
				continue;
			}
			// TODO this use needs a different name (ex: coinjoinMemo)
			if (output.memo) {
				draftTx.feeTarget += output.satoshis;
				output.satoshis = 0;
				continue;
			}
			if (!output.address) {
				if (typeof output.memo !== "string") {
					let err = new Error(`output is missing 'address' and 'pubKeyHash'`);
					throw err;
				}
			} else {
				let pkhBytes = await DashKeys.addrToPkh(output.address, {
					version: App.currentNetwork.network,
				});
				Object.assign(output, {
					pubKeyHash: DashKeys.utils.bytesToHex(pkhBytes),
				});
			}
		}

		draftTx.inputs.sort(DashTx.sortInputs);
		draftTx.outputs.sort(DashTx.sortOutputs);

		return {
			tx: draftTx,
			change: changeOutput,
		};
	}

	/** @param {import('dashtx').TxSummary} signedTx */
	async function commitWalletTx(signedTx) {
		let updatedAddrs = [];
		for (let input of signedTx.inputs) {
			if (!input.address) {
				throw new Error(`developer error: no input.address`);
			}
			updatedAddrs.push(input.address);
			// let knownSpent = spentAddrs.includes(input.address);
			// if (!knownSpent) {
			// 	spentAddrs.push(input.address);
			// }
			// removeElement(addresses, input.address);
			// removeElement(receiveAddrs, input.address);
			// removeElement(changeAddrs, input.address);
			delete deltasMap[input.address];
			// dbSet(input.address, null);
		}
		for (let output of signedTx.outputs) {
			if (!output.address) {
				throw new Error(`developer error: no output.address`);
			}

			let isMemo = !output.address;
			if (isMemo) {
				continue;
			}
			updatedAddrs.push(output.address);
			// removeElement(addresses, output.address);
			// removeElement(receiveAddrs, output.address);
			// removeElement(changeAddrs, output.address);

			delete deltasMap[output.address];
			// dbSet(output.address, null);
		}
		await updateDeltas(updatedAddrs);

		let txid = await DashTx.getId(signedTx.transaction);
		let now = Date.now();
		for (let input of signedTx.inputs) {
			let address = input.address || "";
			let deltaInfo = deltasMap[address];
			let coin = selectCoin(deltaInfo, input.txid, input.outputIndex);
			if (!coin) {
				continue;
			}
			coin.reserved = now; // mark as spent-ish
		}
		for (let i = 0; i < signedTx.outputs.length; i += 1) {
			let output = signedTx.outputs[i];
			if (!output.address) {
				throw new Error(`developer error: no output.address`);
			}

			let info = deltasMap[output.address];
			if (!info) {
				info = { balance: 0, deltas: [], credits: [], debits: [] };
				deltasMap[output.address] = info;
			}
			let deltaInfo = deltasMap[output.address];
			let memCoin = selectCoin(deltaInfo, txid, i);
			if (!memCoin) {
				memCoin = {
					address: output.address,
					satoshis: output.satoshis,
					txid: txid,
					index: i,
					//@ts-expect-error
					blockindex: null,
					//@ts-expect-error
					height: null,
					reserved: 0,
					denom: 0,
				};
				info.deltas.push(memCoin);
			}
		}
	}

	function renderAddresses() {
		let usedAddrs = Object.keys(
			Wallet._caches[App.currentNetwork.network].used,
		);
		$("[data-id=spent-count]").textContent = usedAddrs.length.toString();
		$("[data-id=spent]").textContent = usedAddrs.join("\n");

		let receiveAddrs = [];
		let changeAddrs = [];
		let unusedAddrs = Object.keys(
			Wallet._caches[App.currentNetwork.network].unused,
		);
		for (let address of unusedAddrs) {
			let keyState = Wallet.getKeyStateByAddress(
				App.currentNetwork.network,
				address,
			);
			if (!keyState) {
				console.log(address, Wallet);
				continue;
			}

			if (keyState.usage === DashHd.RECEIVE) {
				receiveAddrs.push(address);
			} else if (keyState.usage === DashHd.CHANGE) {
				changeAddrs.push(address);
			} else {
				// nothing yet, coinjoin later
			}
		}

		let receiveList = receiveAddrs.join("\n");
		$("[data-id=receive-addresses]").textContent =
			`${receiveAddrs.length}\n${receiveList}`;

		let changeList = changeAddrs.join("\n");
		$("[data-id=change-addresses]").textContent =
			`${changeAddrs.length}\n${changeList}`;
	}

	/**
	 * @param {DeltaInfo} deltaInfo
	 * @param {String} txid
	 * @param {Number} index
	 */
	function selectCoin(deltaInfo, txid, index) {
		for (let delta of deltaInfo.deltas) {
			if (delta.txid !== txid) {
				continue;
			}
			if (delta.index !== index) {
				continue;
			}
			return delta;
		}
		throw new Error(
			`the history of that address does not reference index '${index}' in txid '${txid}'`,
		);
	}

	/**
	 * @param {"mainnet"|"testnet"|String} network
	 */
	App.$init = async function (network) {
		App.network = network;
		if (App.network === MAINNET) {
			App.currentNetwork = App.mainnet;
			currentSession = session.mainnet;
		} else {
			App.currentNetwork = App.testnet;
			currentSession = session.testnet;
		}

		if (!sessionPhrase) {
			let phrases = dbGet(`${App.currentNetwork.dbPrefix}wallet-phrases`, []);
			sessionPhrase = phrases[0];
			if (!sessionPhrase) {
				sessionPhrase = await DashPhrase.generate(128);
				dbSet(`${App.currentNetwork.dbPrefix}wallet-phrases`, [sessionPhrase]);
			}
		}
		sessionSeedBytes = await DashPhrase.toSeed(sessionPhrase, sessionSalt);

		App.mainnet.maxConns = dbGet(`max-connections`, App.mainnet.maxConns);
		App.testnet.maxConns = dbGet(
			`testnet-max-connections`,
			App.testnet.maxConns,
		);

		// TODO
		// this is to maintain backwards compat with deployed version (tesnet)
		// we should undo it sometime later today
		currentSession.walletKey = await DashHd.fromSeed(sessionSeedBytes, {
			purpose: App.currentNetwork.purpose,
			coinType: App.currentNetwork.coinType,
			versions: App.currentNetwork.hdVersions,
		});
		currentSession.walletId = await DashHd.toId(currentSession.walletKey);

		denomsMap = {};

		session.accountIndex = await dbGet(
			`wallet-${currentSession.walletId}-primary-index`,
			0,
		);
		// let coinjoinIndex = await dbGet(
		// 	`wallet-${currentSession.walletId}-coinjoin-index`,
		// 	0,
		// );
		// let firstRoundIndex = await dbGet(
		// 	`wallet-${currentSession.walletId}-coinjoin-index`,
		// 	USAGE_COINJOIN,
		// );

		currentSession.accountInfo = await Wallet.rawGetAccountKey(
			App.currentNetwork.network,
			currentSession.walletKey,
			session.accountIndex,
		);
		currentSession.cjAccountInfo = currentSession.accountInfo; // same for now
		console.log(
			`DEBUG ACCOUNT_KEY_INFO`,
			App.currentNetwork.coinType,
			session.accountIndex,
			currentSession.accountInfo,
		);

		let seedHex = DashKeys.utils.bytesToHex(sessionSeedBytes);
		await App._$renderWalletSettings(
			sessionPhrase,
			seedHex,
			session.accountIndex,
			session.cjAccountIndex,
			Wallet.USAGE_COINJOIN,
		);

		$(`input[name="cj-default-rounds"]`).value =
			App.currentNetwork.defaultRounds.toString();

		await App._walletDerive();

		let keysByAddress = Wallet.getCachedKeysMap(App.currentNetwork.network);
		let addresses = Object.keys(keysByAddress);
		await updateDeltas(addresses);
		renderAddresses();
		renderCoins();

		let $testnets = $$("[data-network=testnet]");
		for (let $testnet of $testnets) {
			$testnet.hidden = App.currentNetwork.network === MAINNET;
		}

		siftDenoms();
		renderCashDrawer();
		App.syncCashDrawer();
	};

	App.initP2p = async function () {
		let networkInfo = App.currentNetwork;
		if (!networkInfo.initialized) {
			networkInfo.masternodelist = await App.rpc("masternodelist");
			networkInfo.initialized = true;
		}
		// TODO throttle this / get block height from 'inv'
		networkInfo._chaininfo = await App.rpc("getblockchaininfo");
		networkInfo.startHeight = networkInfo._chaininfo.blocks;

		let nodeIds = Object.keys(networkInfo.masternodelist);
		for (let nodeId of nodeIds) {
			let nodeInfo = Object.assign(
				{
					id: nodeId,
				},
				networkInfo.masternodelist[nodeId],
			);
			if (nodeInfo.status !== "ENABLED") {
				continue;
			}

			nodeInfo.host = nodeInfo.address;
			networkInfo.nodesByProTxHash[nodeInfo.proTxHash] = nodeInfo;
			networkInfo.nodesByHost[nodeInfo.address] = nodeInfo;
		}
		console.info(`${networkInfo.network} nodes (raw), by host and proTxHash`);
		console.info(networkInfo.nodesByHost);
		console.info(networkInfo.nodesByProTxHash);

		// connect up to max
		for (;;) {
			let nodes = Object.values(networkInfo.peers);
			if (nodes.length >= networkInfo.maxConns) {
				break;
			}

			let hosts = Object.keys(networkInfo.nodesByHost);
			void knuthShuffle(hosts);
			let host = hosts[0];
			let nodeInfo = networkInfo.nodesByHost[host];

			console.info("[info] chosen node:", nodeInfo.address);
			void (await P2P.connectRealHard(
				nodeInfo,
				networkInfo._chaininfo.blocks,
			).catch(onConnError));
		}

		// disconnect if beyond max
		for (;;) {
			let hosts = Object.keys(networkInfo.peers);
			if (hosts.length <= networkInfo.maxConns) {
				break;
			}

			let host = hosts.shift() || "";
			let nodeInfo = networkInfo.peers[host];
			console.log(
				`DEBUG host '${host}' '${hosts}'`,
				nodeInfo,
				networkInfo.peers,
			);
			delete networkInfo.peers[host];
			nodeInfo.connection?.close();
		}

		void App._$renderNodeList();
		void App._$renderPoolList();
	};

	/** @param {Error} err */
	function onConnError(err) {
		console.error(`[onConnError]`, err);
	}

	App._$renderNodeList = function () {
		let d = new Date();
		let today = d.toLocaleDateString();
		let networks = [App.mainnet, App.testnet];

		let $nodesTable = $(`[data-id="connections-table-body"]`);
		let $nodeRows = document.createDocumentFragment();
		let $nodeTmpl = $(`[data-id="connection-row-template"]`).content;
		for (let networkInfo of networks) {
			let hosts = Object.keys(networkInfo.peers);
			for (let host of hosts) {
				let $nodeRow = document.importNode($nodeTmpl, true);

				let connInfo = networkInfo.peers[host];
				let nodeInfo = networkInfo.peers[host].node;
				let day = connInfo.connectedAt.toLocaleDateString();
				let time = connInfo.connectedAt.toLocaleTimeString();
				let connectedAt = time;
				if (day !== today) {
					connectedAt = day;
				}
				$(`[data-name="network"]`, $nodeRow).textContent = networkInfo.network;
				$(`[data-name="host"]`, $nodeRow).textContent = nodeInfo.address;
				$(`[data-name="type"]`, $nodeRow).textContent = nodeInfo.type;
				$(`[data-name="connected-at"]`, $nodeRow).textContent = connectedAt;

				let latestTime = connInfo.latestAt.toLocaleTimeString();
				$(`[data-name="last-message-at"]`, $nodeRow).textContent = latestTime;

				$nodeRows.appendChild($nodeRow);
			}
		}

		requestAnimationFrame(function () {
			let mainNodes = Object.values(App.mainnet.nodesByHost);
			$renderNodesList(`[data-id="mainnet-nodes"]`, mainNodes);

			let testNodes = Object.values(App.testnet.nodesByHost);
			$renderNodesList(`[data-id="testnet-nodes"]`, testNodes);

			$nodesTable.replaceChildren($nodeRows);
		});
	};

	App._$renderPoolList = function () {
		let d = new Date();
		let now = d.valueOf();
		let networks = [App.mainnet, App.testnet];

		let $denomsTable = $(`[data-id="denominations-table-body"]`);
		let $denomRows = document.createDocumentFragment();
		let $denomTmpl = $(`[data-id="denominations-row-template"]`).content;
		let denoms = DashJoin.DENOMS.slice();
		denoms.reverse();
		for (let networkInfo of networks) {
			for (let denom of denoms) {
				let cjQueue = networkInfo.coinjoinQueues[denom];

				let allQueueInfos = Object.values(cjQueue);
				allQueueInfos.sort(sortByTimestamp);

				/** @type {Array<QueueInfo>} */
				let queueInfos = [];
				for (let queueInfo of allQueueInfos) {
					let expired = now >= queueInfo.expiresAt;
					let shouldSkip = queueInfo.broadcastAt && expired;
					if (shouldSkip) {
						break;
					}

					queueInfos.unshift(queueInfo);
				}

				if (!queueInfos.length) {
					let $denomClone = $denomTmpl.cloneNode(true);
					/** @type {HTMLElement} */ //@ts-expect-error
					let $row = document.importNode($denomClone, true);

					$(`[data-name="network"]`, $row).textContent = networkInfo.network;
					$(`[data-name="denomination"]`, $row).textContent = denom.toString();
					$(`[data-name="host"]`, $row).textContent = "-";
					$(`[data-name="reports"]`, $row).textContent = "-";
					$(`[data-name="broadcast-at"]`, $row).textContent = "-";
					$(`[data-name="expires-at"]`, $row).textContent = "-";

					$denomRows.appendChild($row);
				}

				for (let queueInfo of queueInfos) {
					let $denomClone = $denomTmpl.cloneNode(true);
					/** @type {HTMLElement} */ //@ts-expect-error
					let $row = document.importNode($denomClone, true);

					$(`[data-name="network"]`, $row).textContent = networkInfo.network;
					$(`[data-name="denomination"]`, $row).textContent = denom.toString();
					$(`[data-name="host"]`, $row).textContent =
						queueInfo.hostnode.address;

					let reports = Object.keys(queueInfo.reportedBy);
					$(`[data-name="reports"]`, $row).textContent =
						reports.length.toString();

					let broadcastDate = new Date(queueInfo.broadcastAt);
					$(`[data-name="broadcast-at"]`, $row).textContent =
						broadcastDate.toLocaleTimeString();

					let expiresDate = new Date(queueInfo.broadcastAt);
					$(`[data-name="expires-at"]`, $row).textContent =
						expiresDate.toLocaleTimeString();

					$denomRows.appendChild($row);
				}
			}
		}

		requestAnimationFrame(function () {
			$denomsTable.replaceChildren($denomRows);
		});
	};

	/**
	 * Sorts two objects by a date property.
	 * @param {QueueInfo} a
	 * @param {QueueInfo} b
	 * @returns {Number}
	 */
	function sortByTimestamp(a, b) {
		let result = a.broadcastAt - b.broadcastAt;
		return result;
	}

	App._$renderSessions = function () {
		let sessions = Object.values(App.sessions);

		requestAnimationFrame(function () {
			for (let session of sessions) {
				console.log(`DEBUG update session`, session);
				App._$renderSession(session);
			}
		});
	};

	/**
	 * @param {SessionInfo} session
	 */
	App._$renderSession = function (session) {
		let firstAddress = session.inputs[0]?.address || "";

		let $sessionsTable = $('[data-id="sessions-table-body"]');
		/** @type {HTMLOmniElement?} */
		let $row = document.body.querySelector(
			`[data-row="${session.host}_${firstAddress}"]`,
		);

		if (!$row) {
			/** @type {HTMLElement} */ //@ts-expect-error
			let $sessTmpl = $('[data-id="sessions-row-template"]').content.cloneNode(
				true,
			);
			$row = $("tr", $sessTmpl);
			$row.dataset.row = `${session.host}_${firstAddress}`;
			$('[data-name="denomination"]', $row).textContent =
				session.denomination.toString();
			$('[data-name="address"]', $row).textContent = firstAddress;
			$sessionsTable.appendChild($row);
		}

		let hostname = session.host.replace(/:.*/, "");
		$('[data-name="hostname"]', $row).textContent = hostname;

		if (session.dsa.valueOf()) {
			$(`[data-name="dsa"]`, $row).textContent = "➡️";
		}
		if (session.dsi.valueOf()) {
			$(`[data-name="dsi"]`, $row).textContent = "➡️";
		}
		if (session.dss.valueOf()) {
			$(`[data-name="dss"]`, $row).textContent = "➡️";
		}
		if (session.dssu) {
			$(`[data-name="dssu"]`, $row).textContent = session.dssu;
		}

		let sendnames = ["dsa", "dsi", "dss"];
		let eventnames = ["dsa", "dsq", "dsi", "dsf", "dss", "dsc"];
		for (let i = 1; i < eventnames.length; i += 1) {
			let curEvent = eventnames[i];

			let isSend = sendnames.includes(curEvent);
			if (isSend) {
				continue;
			}

			/* @type {Date?} */ //@ts-expect-error
			let curDate = session[curEvent]?.valueOf();
			if (!curDate) {
				console.log(`NO ⏰ for '${curEvent}'`);
				break;
			}

			let prevEventIndex = i - 1;
			let prevEvent = eventnames[prevEventIndex];
			/* @type {Date?} */ //@ts-expect-error
			let prevDate = session[prevEvent]?.valueOf();

			let deltaMs = curDate - prevDate;
			let deltaS = deltaMs / 1000;
			let delta = deltaS.toFixed(2);

			$(`[data-name="${curEvent}"]`, $row).textContent = `${delta}s`;
		}
	};

	/**
	 * @param {String} sel
	 * @param {Array<Masternode>} nodes
	 */
	function $renderNodesList(sel, nodes) {
		let oldList = $(sel).textContent;

		let rows = [];
		for (let node of nodes) {
			// console.log(`DEBUG mnshort`, node);
			// '107.170.254.160:9999'.length
			let host = node.address.padStart(20, " ");
			let line = `${host} ${node.type}`;
			rows.push(line);
		}

		let list = rows.join("\n");
		if (list !== oldList) {
			$(sel).textContent = list;
		}
	}

	/**
	 * @typedef CJSlot
	 * @prop {Number} denom
	 * @prop {Number} priority
	 * @prop {Number} have
	 * @prop {Number} want
	 * @prop {Number} need
	 */

	/**
	 * @type {Array<CJSlot>}
	 */
	let defaultCjSlots = [
		{
			denom: 1000010000,
			priority: 1,
			have: 0,
			want: 2,
			need: 0,
		},
		{
			denom: 100001000,
			priority: 10,
			have: 0,
			want: 10,
			need: 0,
		},
		{
			denom: 10000100,
			priority: 10,
			have: 0,
			want: 50,
			need: 0,
		},
		{
			denom: 1000010,
			priority: 1,
			have: 0,
			want: 20,
			need: 0,
		},
		{
			denom: 100001,
			priority: 0,
			have: 0,
			want: 5,
			need: 0,
		},
		// {
		// 	denom: 10000,
		// 	priority: 0,
		// 	have: 0,
		// 	want: 100,
		// 	need: 0,
		// 	collateral: true,
		// },
	];
	function getCashDrawer() {
		let slots = dbGet("cash-drawer-control", []);
		if (!slots.length) {
			slots = defaultCjSlots.slice(0);
			dbSet("cash-drawer-control", slots);
		}
		return slots;
	}

	App.syncCashDrawer = function () {
		let isDirty = false;

		let slots = getCashDrawer();
		for (let slot of slots) {
			let $row = $(`[data-denom="${slot.denom}"]`);

			let priorityStr = $("[name=priority]", $row).value;
			if (priorityStr) {
				let priority = parseFloat(priorityStr);
				if (slot.priority !== priority) {
					isDirty = true;
					slot.priority = priority;
				}
			}

			let wantStr = $("[name=want]", $row).value;
			if (wantStr) {
				let want = parseFloat(wantStr);
				if (slot.want !== want) {
					isDirty = true;
					slot.want = want;
				}
			}
		}

		for (let slot of slots) {
			let addrs = Object.keys(denomsMap[slot.denom]);
			let have = addrs.length;
			let need = slot.want - have;
			need = Math.max(0, need);
			if (need !== slot.need) {
				isDirty = true;
				slot.need = need;
			}
		}

		if (isDirty) {
			dbSet("cash-drawer-control", slots);
		}

		renderCashDrawer();
		return true;
	};

	function renderCashDrawer() {
		let cjBalance = 0;
		let slots = getCashDrawer();
		for (let slot of slots) {
			let $row = $(`[data-denom="${slot.denom}"]`);
			let addrs = Object.keys(denomsMap[slot.denom]);
			let have = addrs.length;
			slot.need = slot.want - have;
			slot.need = Math.max(0, slot.need);

			let priority = $("[name=priority]", $row).value;
			if (priority) {
				if (priority !== slot.priority.toString()) {
					$("[name=priority]", $row).value = slot.priority;
				}
			}
			let want = $("[name=want]", $row).value;
			if (want) {
				if (want !== slot.want.toString()) {
					$("[name=want]", $row).value = slot.want;
				}
			}

			$("[data-name=have]", $row).textContent = have.toString();
			$("[data-name=need]", $row).textContent = slot.need;

			for (let addr of addrs) {
				cjBalance += denomsMap[slot.denom][addr].satoshis;
			}
		}

		let cjAmount = cjBalance / SATS;
		$("[data-id=denom-balance]").textContent = toFixed(cjAmount, 8);
	}

	/**
	 * @param {Event} event
	 */
	App.$denominateCoins = async function (event) {
		event.preventDefault();
		let slots = dbGet("cash-drawer-control");

		// TODO
		// - getAccountUtxos
		// - getCJUtxos
		let utxos = getAllUtxos({ denom: false });

		let changeAddr = await session.takeChangeAddress();
		let draftTx = await App.draftDenominations(slots, utxos, changeAddr);
		if (!draftTx) {
			window.alert(
				`Cash Drawer preferences are already met.\nIncrease the number of desired coins to denominate more.`,
			);
			// await Wallet.untakeAddress(changeAddress) // TODO
			return;
		}

		for (let output of draftTx.outputs) {
			if (output.address) {
				continue;
			}
			let keyState = await Wallet.CJ.takeDenominationKey(
				currentSession.cjAccountInfo,
			);
			output.address = keyState.address;
		}
		console.log("denominationTx", draftTx);

		let signedTx = await App._finalizeSortSignReserveTx(draftTx);

		{
			console.log("DEBUG confirming signed tx", signedTx);
			let satsOut = DashTx.sum(signedTx.outputs);
			let amount = satsOut / SATS;
			let amountStr = toFixed(amount, 4);
			let confirmed = window.confirm(
				`Really denominate ${amountStr} to ${signedTx.outputs.length} addresses (+change)?`,
			);
			if (!confirmed) {
				// await Wallet.untakeAddress(changeAddress) // TODO
				return;
			}
		}

		void (await App._$commitWalletTx(signedTx));

		window.alert(`Success! Denominated coins are locked for Coin Join use.`);
	};

	/**
	 * @typedef TxOutputMini
	 * @prop {Number} satoshis
	 * @prop {String} [address]
	 */

	/**
	 * @param {Array<CJSlot>} slots
	 * @param {Array<FullCoin>} utxos
	 * @param {String} changeAddr
	 * @returns {import('dashtx').TxDraft}
	 */
	App.draftDenominations = function (slots, utxos, changeAddr) {
		let priorityGroups = groupSlotsByPriorityAndAmount(slots);
		let priorities = Object.keys(priorityGroups);
		priorities.sort(sortNumberDesc);

		/** @type {import('dashtx').TxDraft} */ //@ts-expect-error
		let draftTx = null;
		/** @type {Array<TxOutputMini>} */
		let outputs = [];
		/** @type {Partial<import('dashtx').TxOutput>} */
		let changeOutput = { address: changeAddr };

		let needsMore = false;
		for (let priority of priorities) {
			let slots = priorityGroups[priority].slice(0);
			slots.sort(sortSlotsByDenomDesc);

			for (;;) {
				let slot = slots.shift();
				if (!slot) {
					break;
				}
				let isNeeded = slot.need >= 1;
				if (!isNeeded) {
					continue;
				}
				needsMore = true;

				let addressF = Math.random(); // hacky-doo workaround
				let output = {
					satoshis: slot.denom,
					address: addressF.toString(),
				};
				try {
					let draftOutputs = outputs.slice(0);
					draftOutputs.push(output);
					draftTx = DashTx.createLegacyTx(utxos, draftOutputs, changeOutput);
				} catch (e) {
					console.warn(`DEBUG fee error?`, e);
					//@ts-expect-error
					let isFeeError = e.message.includes("fee");
					if (isFeeError) {
						continue;
					}
					throw e;
				}
				outputs.push(output);
				slot.need -= 1;

				console.log("Found coins to make denom", slot.denom, draftTx.inputs);
				if (slot.need >= 1) {
					// We use a round-robin strategy with for slots with the same
					// priority. We put this one back in the list so it can come up
					// again after the next one in line.
					slots.push(slot);
				}
			}
		}

		if (!outputs.length) {
			if (needsMore) {
				throw new Error("not enough coins to meet denomination targets");
			}
		}

		for (let output of outputs) {
			output.address = ""; // hacky-doo workaround
		}

		return draftTx;
	};

	/**
	 * @param {Array<CJSlot>} slots
	 */
	function groupSlotsByPriorityAndAmount(slots) {
		/** @type {Object.<Number, Array<CJSlot>>} */
		let priorityGroups = {};
		for (let slot of slots) {
			if (!priorityGroups[slot.priority]) {
				priorityGroups[slot.priority] = [];
			}
			priorityGroups[slot.priority].push(slot);
		}

		return priorityGroups;
	}

	/**
	 * @param {String|Number} a
	 * @param {String|Number} b
	 */
	function sortNumberDesc(a, b) {
		if (Number(a) < Number(b)) {
			return 1;
		}
		if (Number(a) > Number(b)) {
			return -1;
		}
		return 0;
	}

	/**
	 * @param {CJSlot} a
	 * @param {CJSlot} b
	 */
	function sortSlotsByDenomDesc(a, b) {
		if (a.denom < b.denom) {
			return 1;
		}
		if (a.denom > b.denom) {
			return -1;
		}
		return 0;
	}

	/**
	 * @param {FullCoin} a
	 * @param {FullCoin} b
	 */
	function sortCoinsByDenomAndSatsDesc(a, b) {
		if (a.denom < b.denom) {
			return 1;
		}
		if (a.denom > b.denom) {
			return -1;
		}

		if (a.satoshis < b.satoshis) {
			return 1;
		}
		if (a.satoshis > b.satoshis) {
			return -1;
		}

		//@ts-expect-error
		if (a.hdusage < b.hdusage) {
			return 1;
		}
		//@ts-expect-error
		if (a.hdusage > b.hdusage) {
			return -1;
		}

		//@ts-expect-error
		if (a.hdindex > b.hdindex) {
			return 1;
		}
		//@ts-expect-error
		if (a.hdindex < b.hdindex) {
			return -1;
		}

		return 0;
	}

	/**
	 * @param {Array<String>} addresses
	 */
	async function updateDeltas(addresses) {
		let deltaLists = await Promise.all([
			// See
			// - <https://trpc.digitalcash.dev/#?method=getaddressdeltas&params=[{"addresses":["ybLxVb3aspSHFgxM1qTyuBSXnjAqLFEG8P"]}]&submit>
			// - <https://trpc.digitalcash.dev/#?method=getaddressmempool&params=[{"addresses":["ybLxVb3aspSHFgxM1qTyuBSXnjAqLFEG8P"]}]&submit>
			await App.rpc("getaddressdeltas", { addresses: addresses }),
			// TODO check for proof of instantsend / acceptance
			await App.rpc("getaddressmempool", { addresses: addresses }),
		]);

		let deltaList = deltaLists[0].concat(deltaLists[1]);
		// for (let deltaList of deltaLists) {
		for (let delta of deltaList) {
			if (foreignAddresses[delta.address]) {
				continue;
			}
			// console.log("DEBUG delta", delta);
			if (!deltasMap[delta.address]) {
				deltasMap[delta.address] = {
					balance: 0,
					deltas: [],
					credits: [],
					debits: [],
				};
			}
			deltasMap[delta.address].deltas.push(delta);
			if (delta.statoshis > 0) {
				deltasMap[delta.address].credits.push(delta);
			} else if (delta.satoshis < 0) {
				deltasMap[delta.address].debits.push(delta);
			} else {
				// I dunno...
			}

			// TODO we'll need to also explicitly check utxos if
			// there's a positive balance and debits on the same coin
			deltasMap[delta.address].balance += delta.satoshis;
		}

		let deltasInfoList = Object.values(deltasMap);
		for (let deltasInfo of deltasInfoList) {
			await Wallet.Addresses.setDeltas(deltasInfo.deltas);
		}

		// }
	}

	async function renderCoins() {
		let utxos = getAllUtxos();
		void renderSpendableCoins(utxos);

		let cjUtxos = getAllUtxos({ coinjoin: true });
		for (let utxo of cjUtxos) {
			let keyState = Wallet.getKeyStateByAddress(
				App.currentNetwork.network,
				utxo.address,
			);
			Object.assign(utxo, {
				hdusage: keyState.usage,
				hdindex: keyState.index,
			});
		}
		void renderCoinJoinCoins(cjUtxos);

		let totalBalance = DashTx.sum(utxos);
		void renderScanToLoad(totalBalance);
	}

	/**
	 * @param {Array<FullCoin>} utxos
	 */
	async function renderSpendableCoins(utxos) {
		utxos.sort(sortCoinsByDenomAndSatsDesc);
		let totalBalance = DashTx.sum(utxos);

		requestAnimationFrame(function () {
			let elementStrs = [];
			let template = $("[data-id=coin-row-tmpl]").content;
			for (let _utxo of utxos) {
				let amount = _utxo.satoshis / SATS;
				let utxo = Object.assign(_utxo, { amount: amount });

				let clone = document.importNode(template, true);
				if (!clone.firstElementChild) {
					throw new Error(`satisfy type checker`);
				}

				$("[data-name=coin]", clone).value = [
					utxo.address,
					utxo.txid,
					utxo.outputIndex,
				].join(",");
				$("[data-name=address]", clone).textContent = utxo.address;
				$("[data-name=amount]", clone).textContent = toFixed(utxo.amount, 4);
				if (utxo.denom) {
					$("[data-name=amount]", clone).style.fontStyle = "italic";
					$("[data-name=amount]", clone).style.fontWeight = "bold";
				}
				$("[data-name=txid]", clone).textContent = utxo.txid;
				$("[data-name=output-index]", clone).textContent =
					utxo.index.toString();

				elementStrs.push(clone.firstElementChild.outerHTML);
				//tableBody.appendChild(clone);
			}

			let totalAmount = totalBalance / SATS;
			$("[data-id=total-balance]").innerText = toFixed(totalAmount, 4);

			let $coinsTable = $("[data-id=coin-table]");
			$coinsTable.textContent = "";
			$coinsTable.insertAdjacentHTML("beforeend", elementStrs.join("\n"));
			//$('[data-id=balances]').innerText = balances.join('\n');
		});
	}

	/**
	 * @param {Array<FullCoin>} cjUtxos
	 */
	async function renderCoinJoinCoins(cjUtxos) {
		cjUtxos.sort(sortCoinsByDenomAndSatsDesc);
		let cjBalance = DashTx.sum(cjUtxos);

		requestAnimationFrame(function () {
			let elementStrs = [];
			let template = $("[data-id=cj-row-tmpl]").content;
			for (let _utxo of cjUtxos) {
				let amount = _utxo.satoshis / SATS;
				let utxo = Object.assign(_utxo, { amount: amount });

				let clone = document.importNode(template, true);
				if (!clone.firstElementChild) {
					throw new Error(`satisfy type checker`);
				}

				let keyState = Wallet.getKeyStateByAddress(
					App.currentNetwork.network,
					utxo.address,
				);
				let round = keyState.usage - Wallet.USAGE_COINJOIN;
				let coinId = [utxo.address, utxo.txid, utxo.outputIndex].join(",");
				let defaultRounds = App.currentNetwork.defaultRounds.toString();

				$("[data-name=amount]", clone).textContent = toFixed(utxo.amount, 4);
				$("[name=cjCoin]", clone).value = coinId;
				$("[name=targetRounds]", clone).setAttribute("value", defaultRounds); // won't work with .value =
				$("[data-name=rounds]", clone).textContent = round.toString();
				$("[data-name=hdpath]", clone).textContent =
					`${keyState.hdpath}/${keyState.index}`;
				$("[data-name=address]", clone).textContent = utxo.address;

				elementStrs.push(clone.firstElementChild.outerHTML);
			}

			let totalAmount = cjBalance / SATS;
			$("[data-id=cj-balance]").textContent = toFixed(totalAmount, 4);

			let $coinsTable = $("[data-id=cj-table]");
			$coinsTable.textContent = "";
			$coinsTable.insertAdjacentHTML("beforeend", elementStrs.join("\n"));
		});
	}

	/**
	 * @param {Number} totalBalance
	 */
	async function renderScanToLoad(totalBalance) {
		if (totalBalance >= MIN_BALANCE) {
			$('[data-id="load-balance"]').hidden = true;
			return;
		}

		let firstReceiveKeyInfo = await Wallet.takeUnusedKey(
			currentSession.receiveKeyInfo,
		);

		requestAnimationFrame(function () {
			let [dashAmount, dustAmount] = App._splitBalance(totalBalance);
			let addrQr = new QRCode({
				content: `dash:${firstReceiveKeyInfo.address}?`, // leave amount blank
				padding: 4,
				width: 256,
				height: 256,
				color: "#000000",
				background: "#ffffff",
				ecl: "M",
			});
			let addrSvg = addrQr.svg();

			$('[data-id="load-dash-dust"]').textContent =
				`${dashAmount} DASH + ${dustAmount} dust`;
			$('[data-id="dash-total"]').textContent = dashAmount;
			$('[data-id="dust-total"]').textContent = dustAmount;
			$('[data-id="load-addr"]').textContent = firstReceiveKeyInfo.address;
			$('[data-id="load-qr"]').textContent = "";
			$('[data-id="load-qr"]').insertAdjacentHTML("beforeend", addrSvg);
			$('[data-id="load-balance-button"]').dataset.address =
				firstReceiveKeyInfo.address;
			$('[data-id="load-balance"]').hidden = false;
		});
	}

	function siftDenoms() {
		if (!denomsMap[DashJoin.MIN_COLLATERAL]) {
			denomsMap[DashJoin.MIN_COLLATERAL] = {};
		}
		for (let denom of DashJoin.DENOMS) {
			if (!denomsMap[denom]) {
				denomsMap[denom] = {};
			}
		}

		let addrs = Object.keys(deltasMap);
		for (let addr of addrs) {
			let info = deltasMap[addr];
			if (info.balance === 0) {
				continue;
			}

			for (let coin of info.deltas) {
				let denom = DashJoin.getDenom(coin.satoshis);
				if (!denom) {
					let halfCollateral = DashJoin.MIN_COLLATERAL / 2;
					let fitsCollateral =
						coin.satoshis >= halfCollateral &&
						coin.satoshis < DashJoin.DENOM_LOWEST;
					if (fitsCollateral) {
						denomsMap[DashJoin.MIN_COLLATERAL][coin.address] = coin;
					}
					continue;
				}

				denomsMap[denom][coin.address] = coin;
			}
		}
	}

	/**
	 * @param {Number} f - the number
	 * @param {Number} d - how many digits to truncate (round down) at
	 */
	function toFixed(f, d) {
		let order = Math.pow(10, d);
		let t = f * order;
		t = Math.floor(t);
		f = t / order;
		return f.toFixed(d);
	}

	/**
	 * @param {MasternodeShort} nodeInfo
	 * @param {Number} height
	 */
	P2P.connect = async function (nodeInfo, height) {
		let networkInfo = App.currentNetwork;

		let host = nodeInfo.address || nodeInfo.host;
		if (networkInfo.peers[host]) {
			console.log(`[exists] P2P.connect`, host, networkInfo.peers[host]);
			return;
		}

		let p2p = DashP2P.create();

		let hostParts = host.split(":");
		let hostname = hostParts[0];
		let port = hostParts[1];
		let query = {
			access_token: "secret",
			hostname: hostname,
			port: port,
		};
		let searchParams = new URLSearchParams(query);
		let search = searchParams.toString();
		let p2pWebProxyUrl = App.customP2pUrl;
		if (p2pWebProxyUrl.length === 0) {
			p2pWebProxyUrl = App.currentNetwork.p2pWebProxyUrl;
		}

		let sep = "?";
		let hasQuery = p2pWebProxyUrl.includes("?");
		if (hasQuery) {
			sep = "&";
		}
		let wsc;
		try {
			wsc = new WebSocket(`${p2pWebProxyUrl}${sep}${search}`);
		} catch (e) {
			console.error(`DEBUG WS error`, e);
			console.error(e);
			throw e;
		}

		await p2p.initWebSocket(wsc, {
			network: networkInfo.network,
			hostname: hostname,
			port: port,
			start_height: height,
		});

		let senddsqBytes = DashJoin.packers.senddsq({
			network: App.currentNetwork.network,
		});
		console.log("[REQ: %csenddsq%c]", "color: $55daba", "color: inherit");
		p2p.send(senddsqBytes); // 'senddsq' is to SUBSCRIBE

		void p2p.createSubscriber(
			["dsq"],
			/**
			 * @param {any} evstream
			 */
			async function (evstream) {
				let msg = await evstream.once("dsq");
				let dsq = DashJoin.parsers.dsq(msg.payload);

				let hostnode = networkInfo.nodesByProTxHash[dsq.protxhash];
				if (!hostnode) {
					console.warn(`warn: no connectable node for ${dsq.protxhash}`);
					return;
				}

				if (dsq.ready) {
					console.log(
						"%c[DEBUG dsq ready]",
						"color: #bada55",
						`parsed dsq`,
						dsq,
					);
				} else {
					// console.log(
					// 	"%c[DEBUG dsq]",
					// 	"color: #dababa",
					// 	`parsed dsq from ${evonode.hostname}`,
					// 	dsq,
					// );
				}

				let queueInfo =
					networkInfo.coinjoinQueues[dsq.denomination][hostnode.proTxHash];
				if (!queueInfo) {
					let broadcastAt = dsq.timestamp_unix * 1000;
					let expiresAt = broadcastAt + DashJoin.AGE_STALE;
					queueInfo = {
						dsq: dsq,
						hostnode: hostnode,
						reportedBy: {},
						broadcastAt: broadcastAt,
						expiresAt: expiresAt,
					};
					networkInfo.coinjoinQueues[dsq.denomination][hostnode.proTxHash] =
						queueInfo;
				}
				queueInfo.reportedBy[host] = new Date();

				let reporters = Object.keys(queueInfo.reportedBy);
				console.log(
					"%c[[DSQ]]",
					"color: #bada55",
					dsq.denomination,
					dsq.ready,
					hostnode.address,
					reporters.length,
				);

				networkInfo.peers[host].latestAt = new Date();

				void App._$renderNodeList();
				void App._$renderPoolList();
			},
		);

		/**
		 * @param {Error} err
		 */
		function cleanup(err) {
			console.error("[cj ws cleanup]:", err);
			delete networkInfo.peers[host];
			for (let denom of DashJoin.DENOMS) {
				delete networkInfo.coinjoinQueues[denom][nodeInfo.proTxHash];
			}
			p2p.close();
		}

		//@ts-expect-error
		wsc.addEventListener("error", cleanup);
		//@ts-expect-error
		wsc.addEventListener("close", cleanup);

		let d = new Date();
		networkInfo.peers[host] = {
			connection: p2p,
			connectedAt: d,
			latestAt: d,
			node: nodeInfo,
		};
		console.log(`P2P $$$$$$ connect [post]`, host, networkInfo.peers[host]);
	};

	/**
	 * @param {MasternodeShort} nodeInfo
	 * @param {Number} height
	 * @param {Number} [maxAttempts=10]
	 */
	P2P.connectRealHard = async function (nodeInfo, height, maxAttempts = 15) {
		let count = 0;
		for (;;) {
			try {
				console.log(`P2P $$$$$$ connect [pre]`, count);
				await P2P.connect(nodeInfo, height);
				console.log(`P2P $$$$$$ connect [post]`);
			} catch (e) {
				if (count > maxAttempts) {
					throw new Error(`can't connect to node ${nodeInfo.address}`);
				}
				count += 1;
				await sleep(250);
				continue;
			}
			break;
		}
		console.log(`P2P $$$$$$ connectRealHard [return]`);
	};

	// TODO close all peers

	// 0. 'dsq' broadcast puts a node in the local in-memory pool
	// 1. 'dsa' requests to be allowed to join a session
	// 2. 'dssu' accepts
	//      + 'dsq' marks ready (in either order)
	// 3. 'dsi' signals desired coins in and out
	// 4. 'dsf' accepts specific coins in and out
	// 5. 'dss' sends signed inputs paired to trusted outputs
	// 6. 'dssu' updates status
	//      + 'dsc' confirms the tx will broadcast soon

	let CJ = {};
	/**
	 * @param {String} network
	 * @param {Number} denomination
	 * @param {Number} [now]
	 */
	CJ.connectToBestNode = async function (
		network,
		denomination,
		now = Date.now(),
	) {
		console.log(`COINJOIN %%%%%% connectToBestNode 1`);
		let networkInfo = App.mainnet;
		if (network !== MAINNET) {
			networkInfo = App.testnet;
		}

		console.log(`COINJOIN %%%%%% connectToBestNode 2`);
		let queueInfos = Object.values(networkInfo.coinjoinQueues[denomination]);
		queueInfos.sort(sortByTimestamp);

		/** @type {QueueInfo?} */
		let queueInfo = queueInfos[0];
		if (queueInfo) {
			console.log(`COINJOIN %%%%%% connectToBestNode 3b`);
			let expired = now >= queueInfo.expiresAt;
			let shouldSkip = queueInfo.broadcastAt && expired;
			if (shouldSkip) {
				queueInfo = null;
			}
		}

		console.log(`COINJOIN %%%%%% connectToBestNode 4`);
		let host = queueInfo?.hostnode?.address;
		if (!host) {
			console.log(`COINJOIN %%%%%% connectToBestNode 4b`);
			let hosts = Object.keys(networkInfo.nodesByHost);
			void knuthShuffle(hosts);
			host = hosts[0];
		}

		console.log(`COINJOIN %%%%%% connectToBestNode 5`, host);
		let p2pHost = networkInfo.peers[host]?.connection;
		if (!p2pHost) {
			console.log(
				`COINJOIN %%%%%% connectToBestNode 5b`,
				host,
				networkInfo.nodesByHost[host],
			);
			void (await P2P.connectRealHard(
				networkInfo.nodesByHost[host],
				networkInfo._chaininfo.blocks,
				10,
			));
			// networkInfo.peers[host]
			p2pHost = networkInfo.peers[host].connection;
		}

		console.log(`COINJOIN %%%%%% connectToBestNode 6`);
		return p2pHost;
	};

	/**
	 * @param {String} network
	 * @param {Number} denomination
	 * @param {ReturnType<typeof DashP2P.create>} p2pHost
	 * @param {Array<FullCoin>} inputs
	 * @param {Array<import('dashtx').TxOutput>} outputs
	 * @param {Array<Uint8Array>} collateralTxes
	 * @param {Function} notify
	 */
	CJ.joinSession = async function (
		network, // "mainnet"
		denomination, // 1000010000
		p2pHost, // {createSubscriber, send}
		inputs, // [{address, txid, pubKeyHash, ...getPrivateKeyInfo }]
		outputs, // [{ pubKeyHash, satoshis }]
		collateralTxes, // (for dsa and dsi) any 2 txes having fees >=0.00010000 more than necessary
		notify,
	) {
		// todo: pick a smaller size that matches the dss
		let message = new Uint8Array(DashP2P.PAYLOAD_SIZE_MAX);

		void p2pHost.createSubscriber(
			["dssu"],
			/**
			 * @param {any} evstream
			 */
			async function (evstream) {
				let msg = await evstream.once("dssu");
				let dssu = DashJoin.parsers.dssu(msg.payload);
				if (dssu.state === "ERROR") {
					evstream.close();
					throw new Error();
				}
				notify("receive", "dssu", dssu);
			},
		);

		let evstream = p2pHost.createSubscriber(["dssu", "dsq", "dsf", "dsc"]);
		if (!evstream) {
			throw new Error(
				"TODO: create separate function call for createSubscriber",
			);
		}

		{
			/** @type {Uint8Array} */ //@ts-expect-error
			let collateralTx = collateralTxes.shift();
			let dsa = {
				network: network,
				message: message,
				denomination: denomination,
				collateralTx: collateralTx,
			};
			let dsaBytes = DashJoin.packers.dsa(dsa);
			console.log("➡️ DEBUG dsa, dsaBytes", dsa, dsaBytes);
			p2pHost.send(dsaBytes);
			notify("send", "dsa");
			for (;;) {
				let msg = await evstream.once();

				if (msg.command === "dsq") {
					let dsq = DashJoin.parsers.dsq(msg.payload);
					if (dsq.denomination !== denomination) {
						continue;
					}
					if (!dsq.ready) {
						// TODO switch to the good node
						continue;
					}
					notify("receive", "dsq", dsq);
					break;
				}

				if (msg.command === "dssu") {
					let dssu = DashJoin.parsers.dssu(msg.payload);
					if (dssu.state === "ERROR") {
						evstream.close();
						throw new Error();
					}
					notify("receive", "dssu", dssu);
				}
			}
		}

		let dsfTxRequest;
		{
			/** @type {Uint8Array} */ //@ts-expect-error
			let collateralTx = collateralTxes.shift();
			let dsiInfo = {
				network: network,
				message: message,
				inputs: inputs,
				collateralTx: collateralTx,
				outputs: outputs,
			};
			console.log(`DEBUG dsi input`, dsiInfo);
			//@ts-expect-error // TODO
			let dsiBytes = DashJoin.packers.dsi(dsiInfo);
			console.log(`DEBUG dsi bytes`, p2pHost._host, p2pHost._network, dsiBytes);
			p2pHost.send(dsiBytes);
			notify("send", "dsi");

			let msg = await evstream.once("dsf");
			notify("receive", "dsf", msg);

			console.log("DEBUG dsf %c[[MSG]]", "color: blue", msg);
			let dsfTxRequest = DashJoin.parsers.dsf(msg.payload);
			console.log("DEBUG dsf", dsfTxRequest, inputs);

			//@ts-expect-error // TODO
			makeSelectedInputsSignable(dsfTxRequest, inputs);
			let txSigned = await dashTx.hashAndSignAll(dsfTxRequest);

			let signedInputs = [];
			for (let input of txSigned.inputs) {
				if (!input?.signature) {
					continue;
				}
				signedInputs.push(input);
			}
			assertSelectedOutputs(dsfTxRequest, outputs, inputs.length);

			let dssBytes = DashJoin.packers.dss({
				network: network,
				message: message,
				inputs: signedInputs,
			});
			p2pHost.send(dssBytes);
			notify("send", "dss");

			void (await evstream.once("dsc"));
			notify("receive", "dsc");
		}

		return dsfTxRequest;
	};

	/**
	 * @param {import('dashtx').TxSummary} txRequest
	 * @param {Array<FullCoin>} inputs
	 */
	function makeSelectedInputsSignable(txRequest, inputs) {
		// let selected = [];

		for (let input of inputs) {
			if (!input.publicKey) {
				let msg = `coin '${input.address}:${input.txid}:${input.outputIndex}' is missing 'input.publicKey'`;
				throw new Error(msg);
			}
			for (let sighashInput of txRequest.inputs) {
				if (sighashInput.txid !== input.txid) {
					continue;
				}
				if (sighashInput.outputIndex !== input.outputIndex) {
					continue;
				}

				let sigHashType = DashTx.SIGHASH_ALL | DashTx.SIGHASH_ANYONECANPAY; //jshint ignore:line

				console.log(sighashInput);
				console.log(input);
				Object.assign({
					index: input.index,
					satoshis: input.satoshis,
				});
				sighashInput.address = input.address;
				sighashInput.pubKeyHash = input.pubKeyHash;
				// sighashInput.script = input.script;
				sighashInput.publicKey = input.publicKey;
				sighashInput.sigHashType = sigHashType;
				// sighashInputs.push({
				//      txId: input.txId || input.txid,
				//      txid: input.txid || input.txId,
				//      outputIndex: input.outputIndex,
				//      pubKeyHash: input.pubKeyHash,
				//      sigHashType: input.sigHashType,
				// });

				// selected.push(input);
				break;
			}
		}

		// return selected;
	}

	/**
	 * @param {any} txRequest
	 * @param {Array<import('dashtx').TxOutput>} outputs
	 * @param {Number} count
	 */
	function assertSelectedOutputs(txRequest, outputs, count) {
		let _count = 0;
		for (let output of outputs) {
			for (let sighashOutput of txRequest.outputs) {
				if (sighashOutput.pubKeyHash !== output.pubKeyHash) {
					continue;
				}
				if (sighashOutput.satoshis !== output.satoshis) {
					continue;
				}

				_count += 1;
			}
		}

		if (count !== _count) {
			let msg = `expected ${count} matching outputs but found found ${_count}`;
			throw new Error(msg);
		}
	}

	/**
	 * @param {Number} ms
	 */
	async function sleep(ms) {
		return await new Promise(function (resolve) {
			setTimeout(resolve, ms);
		});
	}

	async function main() {
		let network = await dbGet("network", MAINNET);
		await Wallet.init();

		$(`[name="dashNetwork"][value="${network}"]`).checked = true;
		//@ts-expect-error
		await $(`[name="dashNetwork"]:checked`).onchange();
		//await App.$init(network);

		$(`[name="wsConnLimit"]`).value = dbGet(
			`${App.dbPrefix}max-connections`,
			3,
		);

		$("body").removeAttribute("hidden");
		await App.initP2p();
	}

	/**
	 * @param {Array<FullCoin>} fullCoins
	 * @param {Number} defaultRounds
	 */
	CJ.prepareSessionParams = async function (fullCoins, defaultRounds) {
		/** @type {Array<FullCoin>} */
		let inputs = [];
		/** @type {Array<import('dashtx').TxOutput>} */
		let outputs = [];

		let denom = 0;
		for (let fullCoin of fullCoins) {
			if (!fullCoin.denom) {
				let coinJson = JSON.stringify(fullCoin, null, 2);
				let msg = `missing denomination info:\n${coinJson}`;
				throw new Error(msg);
			}

			if (!denom) {
				denom = fullCoin.denom;
			}

			if (fullCoin.denom !== denom) {
				let msg = "all coins must be of the same denomination";
				throw new Error(msg);
			}
		}

		console.log(`DEBUG CURRENT SESSION`, currentSession);
		for (let fullCoin of fullCoins) {
			inputs.push(fullCoin);

			let maxRounds = fullCoin.rounds ?? defaultRounds;
			let nextRoundKey = await Wallet.CJ.takeRoundKey(
				currentSession.cjAccountInfo,
				fullCoin.address,
				maxRounds,
				currentSession.receiveKeyInfo,
			);
			let nextRoundAddress = nextRoundKey.address;

			let pkhBytes = await DashKeys.addrToPkh(nextRoundAddress, {
				version: App.currentNetwork.network,
			});
			let pubKeyHash = DashKeys.utils.bytesToHex(pkhBytes);

			let output = {
				address: nextRoundAddress,
				satoshis: denom,
				pubKeyHash: pubKeyHash,
			};
			outputs.push(output);
		}

		let collateralTxes = [
			await App._signCollateral(DashJoin.MIN_COLLATERAL),
			await App._signCollateral(DashJoin.MIN_COLLATERAL),
		];

		return {
			inputs: inputs,
			outputs: outputs,
			collaterals: collateralTxes,
		};
	};

	/**
	 * @param {Array<FullCoin>} inputs
	 * @param {Array<import('dashtx').TxOutput>} outputs
	 * @param {Array<Uint8Array>} collateralBytesList
	 */
	CJ.beginSession = async function (inputs, outputs, collateralBytesList) {
		let network = App.currentNetwork.network;
		let denom = inputs[0].denom;

		/** @type {ReturnType<typeof DashP2P.create>} */ //@ts-expect-error
		let p2pHost = null;
		let host = "";
		let firstAddress = inputs[0]?.address || "";
		let sessionId = "";

		/** @type {SessionInfo} */
		let session = {
			denomination: denom,
			address: "",
			host: "",
			inputs: inputs,
			dssu: "",
			dsa: new Date(),
			dsq: new Date(0),
			dsi: new Date(0),
			dsf: new Date(0),
			dss: new Date(0),
			dsc: new Date(0),
		};

		/**
		 * @param {String} direction
		 * @param {String} eventname
		 * @param {any} msg
		 */
		function notify(direction, eventname, msg) {
			console.log("🧨 DEBUG eventname", eventname, msg);
			if (eventname === "dssu") {
				session.dssu = msg.state || msg.status;
			} else {
				//@ts-expect-error
				session[eventname] = new Date();
			}

			App._$renderSessions();
		}

		try {
			let minute = 60 * 1000;
			let timeout = 5 * minute;

			let denomination = inputs[0].satoshis;
			/** @type {ReturnType<typeof DashP2P.create>?} */
			let _p2pHost = null;
			console.log(`COINJOIN %%%%%% connectToBestNode [pre]`);
			let p2pPromise = CJ.connectToBestNode(network, denomination).then(
				function (p2pHost) {
					_p2pHost = p2pHost;
				},
			);
			let dsqTimeout = sleep(timeout).then(function () {
				if (!_p2pHost) {
					session.dssu = "(timeout)";
				}
			});
			await Promise.race([p2pPromise, dsqTimeout]);
			console.log(`COINJOIN %%%%%% connectToBestNode [post]`, _p2pHost);
			if (!_p2pHost) {
				return;
			}
			/** @type {ReturnType<typeof DashP2P.create>} */
			p2pHost = _p2pHost;

			host = p2pHost._host;
			session.address = host;
			session.host = host;

			sessionId = `${host}${firstAddress}`;
			App.sessions[sessionId] = session;
			App._$renderSessions();

			console.log(`COINJOIN %%% joinSession`, session, p2pHost);
			let joinPromise = CJ.joinSession(
				network,
				denomination,
				p2pHost,
				inputs,
				outputs,
				collateralBytesList,
				notify,
			);
			let joinTimeout = sleep(timeout).then(function () {
				if (!session.dsc) {
					session.dssu = "(timeout)";
				}
			});
			await Promise.race([joinPromise, joinTimeout]);
		} catch (e) {
			App._unreserveTx({ inputs, outputs });
			console.error(e);
			session.dssu = "(error)";
			throw e;
		} finally {
			setTimeout(function () {
				if (p2pHost) {
					p2pHost.close();
				}
				App._$renderSessions();
				delete App.sessions[sessionId];
			}, 250);
			//await App.initP2p();
		}
	};

	App._signCollateral = async function (collateral = DashJoin.MIN_COLLATERAL) {
		let changeAddress = await session.takeChangeAddress();
		let draftTx = await App._createMemoTx({
			burn: 0,
			memo: "",
			message: null,
			collateral: DashJoin.MIN_COLLATERAL,
			changeAddress: changeAddress,
		});
		let signedTx = await App._finalizeSortSignReserveTx(draftTx);
		console.log("collateral memo signed", signedTx);

		let signedTxBytes = DashTx.utils.hexToBytes(signedTx.transaction);
		return signedTxBytes;
	};

	App.$createCoinJoinSession = async function () {
		let $coins = $$("[name=cjCoin]:checked");
		if (!$coins.length) {
			$coins = $$("[name=cjCoin]");
		}
		if (!$coins.length) {
			let msg = "No denominated coins available. Denominate some coins first.";
			window.alert(msg);
			return;
		}

		let fullCoins = [];
		for (let $coin of $coins) {
			/** @type {HTMLOmniElement} */ //@ts-expect-error
			let $row = $coin.closest("tr");
			let roundsStr = $(`input[name="targetRounds"]`, $row).value;
			let rounds = parseInt(roundsStr, 10);
			let [address, txid, indexStr] = $coin.value.split(",");
			let index = parseInt(indexStr, 10);

			let keyState = Wallet.getKeyStateByAddress(
				App.currentNetwork.network,
				address,
			);
			let deltaInfo = deltasMap[address];
			let coinDelta = selectCoin(deltaInfo, txid, index);
			coinDelta.rounds = rounds;

			let fullCoin = toFullCoin(keyState, coinDelta);
			fullCoins.push(fullCoin);
		}

		let defaultRoundsStr = $(`[name="cj-default-rounds"]`).value;
		let defaultRounds = parseInt(defaultRoundsStr, 10);

		let cjParams = await CJ.prepareSessionParams(fullCoins, defaultRounds);
		await CJ.beginSession(
			cjParams.inputs,
			cjParams.outputs,
			cjParams.collaterals,
		);
	};

	main().catch(function (err) {
		console.error(`Error in main:`, err);
	});
})();

/**
 * @typedef MasternodeShort
 * @prop {String} id
 * @prop {String} proTxHash
 * @prop {String} type
 * @prop {String} address
 * @prop {String} host - "address"
 * @prop {String} hostname
 * @prop {String} port
 * @prop {String} pubkeyoperator
 */

/**
 * @typedef Masternode
 * @prop {String} id - dunno, but it looks like tx and output index
 * @prop {String} proTxHash - The ProTxHash of the masternode.
 * @prop {String} address - The IP address and port of the masternode in the format "IP:Port".
 * @prop {String} payee - The address to which the masternode's rewards are paid.
 * @prop {String} status - The status of the masternode (e.g., "POSE_BANNED").
 * @prop {String} type - The type of masternode (e.g., "Regular").
 * @prop {Number} pospenaltyscore - The Proof-of-Service (PoSe) penalty score of the masternode.
 * @prop {Number} consecutivePayments - The number of consecutive payments received by the masternode.
 * @prop {Number} lastpaidtime - The Unix timestamp of the last payment to the masternode.
 * @prop {Number} lastpaidblock - The block height of the last payment to the masternode.
 * @prop {String} owneraddress - The owner address of the masternode.
 * @prop {String} votingaddress - The voting address associated with the masternode.
 * @prop {String} collateraladdress - The address used for the masternode's stake.
 * @prop {String} pubkeyoperator - The public key of the operator for the masternode.
 */

/** @typedef {String} Hex */
/** @typedef {Number} Int32 */
/** @typedef {Number} Uint16 */
/** @typedef {Number} Uint32 */
