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
		if ($els.length === 0) {
			throw new Error(`selector '${sel}' selected no elements`);
		}

		//@ts-expect-error
		return $els;
	}

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
	const MIN_BALANCE = 100001 * 1000;

	/**
	 * @typedef AddressActivity
	 * @prop {Number} balance
	 * @prop {Array<CoinInfo>} deltas
	 */

	/**
	 * @typedef CoinInfo
	 * @prop {String} address
	 * @prop {Number} index
	 * @prop {Number} satoshis
	 * @prop {Number} reserved - Date.now()
	 * @prop {Number} denom
	 */

	const MAINNET = "mainnet";
	const COINTYPE_DASH = 5;
	const COINTYPE_TESTNET = 1; // testnet (for all coins)

	App.network = MAINNET;
	App.coinType = COINTYPE_DASH;
	App.hdVersions = DashHd.MAINNET;
	App.dbPrefix = "";
	App.customRpcUrl = "";
	App.customP2pUrl = "";
	App.rpcExplorer = "";
	App.rpcBaseUrl = "";
	App.p2pWebProxyUrl = "";

	let sessionSalt = "";

	/** @type {Array<String>} */
	let addresses = [];
	/** @type {Array<String>} */
	let changeAddrs = [];
	/** @type {Array<String>} */
	let receiveAddrs = [];
	/** @type {Array<String>} */
	let spentAddrs = [];
	/** @type {Array<String>} */
	let spendableAddrs = [];
	/** @type {Object.<String, AddressActivity>} */
	let deltasMap = {};
	/** @type {Object.<String, KeyInfo>} */
	let keysMap = {};
	/** @type {Object.<Number, Object.<String, CoinInfo>>} */
	let denomsMap = {};

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
	 * @prop {Number} maxConns
	 * @prop {Boolean} initialized
	 * @prop {Object.<Number, QueueInfo>} coinjoinQueues
	 * @prop {Object.<String, Masternode>} masternodelist
	 * @prop {Object.<String, Masternode>} nodesByProTxHash
	 * @prop {Object.<String, Masternode>} nodesByHost
	 * @prop {Number} startHeight
	 * @prop {ChainInfo} _chaininfo
	 * @prop {Object.<String, PeerInfo>} peers
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
		maxConns: 3,
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
	};

	/** @type {NetworkInfo} */
	App.testnet = {
		network: "testnet",
		maxConns: 3,
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
	};

	/**
	 * @typedef SessionInfo
	 * @prop {String} host - hostname:port
	 * @prop {String} address - hostname:port
	 * @prop {Array<Partial<import('dashtx').TxInputForSig>>} inputs
	 * @prop {String} denomination
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
				// address = await DashKeys.pkhToAddr(pkhBytes, { version: App.network });
			}

			let yourKeyData = keysMap[address];

			let privKeyBytes = await DashKeys.wifToPrivKey(yourKeyData.wif, {
				version: App.network,
			});
			return privKeyBytes;
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
	 */
	function getAllUtxos(opts) {
		let utxos = [];
		let spendableAddrs = Object.keys(deltasMap);
		for (let address of spendableAddrs) {
			let info = deltasMap[address];
			info.balance = DashTx.sum(info.deltas);

			for (let coin of info.deltas) {
				let addressInfo = keysMap[coin.address];
				Object.assign(coin, {
					outputIndex: coin.index,
					denom: DashJoin.getDenom(coin.satoshis),
					publicKey: addressInfo.publicKey,
					pubKeyHash: addressInfo.pubKeyHash,
				});

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
			rpcBaseUrl = App.rpcBaseUrl;
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

		// let networkInfo = App.testnet;
		// if (App.network === MAINNET) {
		// 	networkInfo = App.mainnet;
		// }
		// networkInfo.initialized = false;
		// await App.$init();
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

		// let networkInfo = App.testnet;
		// if (App.network === MAINNET) {
		// 	networkInfo = App.mainnet;
		// }
		// networkInfo.initialized = false;
		// await App.$init();
	};

	/**
	 * @param {String} phrase
	 * @param {String} salt
	 * @param {Number} accountIndex
	 */
	App.$saveWallet = async function (phrase, salt, accountIndex) {
		await DashPhrase.verify(phrase);

		let phrases = dbGet(`${App.dbPrefix}wallet-phrases`, []);
		for (;;) {
			let hasPhrase = phrases.includes(phrase);
			if (!hasPhrase) {
				break;
			}
			removeElement(phrases, phrase);
		}
		phrases.unshift(phrase);
		dbSet(`${App.dbPrefix}wallet-phrases`, phrases);

		let primarySeedBytes = await DashPhrase.toSeed(phrase, sessionSalt);
		let walletKey = await DashHd.fromSeed(primarySeedBytes);
		let walletId = await DashHd.toId(walletKey);
		dbSet(`wallet-${walletId}-account-index`, accountIndex);

		$('[data-id="wallet-status"]').textContent = "";
		setTimeout(async function () {
			$('[data-id="wallet-status"]').textContent = "updating...";
			// await App._$walletUpdate(phrase, salt, accountIndex, coinjoinIndex);
			await App.$init(App.network);
		}, 100);
		setTimeout(function () {
			$('[data-id="wallet-status"]').textContent = "updated";
		}, 550);
		setTimeout(function () {
			$('[data-id="wallet-status"]').textContent = "";
		}, 1500);
	};

	/**
	 * @param {String} phrase
	 * @param {String} salt
	 * @param {Number} primaryAccount - 0 (typical primary)
	 * @param {Number} coinjoinAccount - 1 (above primary)
	 * @param {Number} firstRoundIndex - 2 (above receive/change)
	 */
	App._$walletUpdate = async function (
		phrase,
		salt,
		primaryAccount = 0,
		coinjoinAccount = 1,
		firstRoundIndex = 2,
	) {
		sessionSalt = salt || "";

		let seedBytes = await DashPhrase.toSeed(phrase, sessionSalt);
		let seedHex = DashKeys.utils.bytesToHex(seedBytes);

		$('[name="walletPhrase"]').value = phrase;
		$('[name="walletSeed"]').value = seedHex;

		$('[name="primaryAccount"]').value = primaryAccount.toString();
		$("[data-id=primary-path]").value =
			`m/44'/${App.coinType}'/${primaryAccount}'`;

		$('[name="coinjoinAccount"]').value = coinjoinAccount.toString();
		$("[data-id=coinjoin-path]").value =
			`m/44'/${App.coinType}'/${coinjoinAccount}'/${firstRoundIndex}`;

		// $('[name="walletPhrase"]').type = "password"; // delayed to avoid pw prompt
		// $('[name="walletSeed"]').type = "password"; // delayed to avoid pw prompt
		// $('[name="phraseSalt"]').type = "password"; // delayed to avoid pw prompt
	};

	/**
	 * @param {String} phrase
	 * @param {String} sessionSalt
	 * @param {Number} accountIndex
	 * @param {Number} lastReceiveIndex
	 * @param {Number} lastChangeIndex
	 */
	App._walletDerive = async function (
		phrase,
		sessionSalt,
		accountIndex,
		lastReceiveIndex = 0,
		lastChangeIndex = 0,
	) {
		// reset all key & address state
		addresses = [];
		changeAddrs = [];
		receiveAddrs = [];
		spentAddrs = [];
		spendableAddrs = [];
		deltasMap = {};
		// keysMap = {}; // this is reference-only

		let primarySeedBytes = await DashPhrase.toSeed(phrase, sessionSalt);
		let walletKey = await DashHd.fromSeed(primarySeedBytes);
		let walletId = await DashHd.toId(walletKey);

		let accountKey = await walletKey.deriveAccount(0, {
			purpose: 44, // BIP-44 (default)
			coinType: App.coinType,
			versions: App.hdVersions,
		});
		let xprvReceiveKey = await accountKey.deriveXKey(DashHd.RECEIVE);
		let xprvChangeKey = await accountKey.deriveXKey(DashHd.CHANGE);

		let receiveEnd = lastReceiveIndex + 50;
		for (let i = lastReceiveIndex; i < receiveEnd; i += 1) {
			let receiveKey;
			try {
				receiveKey = await xprvReceiveKey.deriveAddress(i); // xprvKey from step 2
			} catch (e) {
				receiveEnd += 1; // to make up for skipping on error
				continue;
			}
			await addKey(walletId, accountIndex, receiveKey, DashHd.RECEIVE, i);
		}

		let changeEnd = lastChangeIndex + 50;
		for (let i = lastChangeIndex; i < changeEnd; i += 1) {
			let changeKey;
			try {
				changeKey = await xprvChangeKey.deriveAddress(i); // xprvKey from step 2
			} catch (e) {
				changeEnd += 1; // to make up for skipping on error
				continue;
			}
			await addKey(walletId, accountIndex, changeKey, DashHd.CHANGE, i);
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
	App.sendDash = async function (event) {
		event.preventDefault();

		let amountStr = $("[data-id=send-amount]").value || "0";
		let amount = parseFloat(amountStr);
		let satoshis = Math.round(amount * SATS);
		// if (satoshis === 0) {
		//     satoshis = null;
		// }

		let address = $("[data-id=send-address]").value;
		if (!address) {
			let err = new Error(`missing payment 'address' to send funds to`);
			window.alert(err.message);
			throw err;
		}

		let balance = 0;

		/** @type {Array<import('dashtx').TxInput>?} */
		let inputs = null;
		/** @type {Array<import('dashtx').TxInput>?} */
		let utxos = null;

		/** @type {Array<HTMLInputElement>} */ //@ts-expect-error
		let $coins = document.querySelectorAll("input[data-name=coin]:checked");
		if ($coins.length) {
			inputs = [];
			for (let $coin of $coins) {
				let [address, txid, indexStr] = $coin.value.split(",");
				let index = parseInt(indexStr, 10);
				let coin = selectCoin(address, txid, index);
				Object.assign(coin, { outputIndex: coin.index });
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
			window.alert(err.message);
			throw err;
		}

		console.log("DEBUG Payment Address:", address);
		console.log("DEBUG Available coins:", utxos?.length || inputs?.length);
		console.log("DEBUG Available balance:", balance);
		console.log("DEBUG Amount:", amount);

		if (!inputs) {
			if (!utxos) {
				throw new Error(`type fail: neither 'inputs' nor 'utxos' is set`);
			}
		}
		let output = { satoshis, address };
		//@ts-expect-error
		let draft = await draftWalletTx(utxos, inputs, output);

		amount = output.satoshis / SATS;
		$("[data-id=send-dust]").textContent = draft.tx.feeTarget;
		$("[data-id=send-amount]").textContent = toFixed(amount, 8);

		let signedTx = await dashTx.legacy.finalizePresorted(draft.tx);
		console.log("DEBUG signed tx", signedTx);
		{
			let amountStr = toFixed(amount, 4);
			let confirmed = window.confirm(`Really send ${amountStr} to ${address}?`);
			if (!confirmed) {
				return;
			}
		}

		void (await App._$commitWalletTx(signedTx));
	};

	/** @param {Event} event */
	App.$exportWif = async function (event) {
		event.preventDefault();

		let address = $("[name=exportAddress]").value;
		let privKey;
		try {
			privKey = await keyUtils.getPrivateKey({ address });
		} catch (e) {
			window.alert(`invalid address '${address}'`);
		}
		let wif = await DashKeys.privKeyToWif(privKey, { version: App.network });

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

		let changeAddress = changeAddrs.shift();
		if (!changeAddress) {
			throw new Error("ran out of change addresses (refresh page)");
		}
		let signedTx = await App._signMemo({ burn, memo, message, changeAddress });
		{
			let confirmed = window.confirm(
				`Really send '${memoEncoding}' memo '${msg}'?`,
			);
			if (!confirmed) {
				return;
			}
		}

		let txid = await App._$commitWalletTx(signedTx);

		$("[data-id=memo-txid]").textContent = txid;
		let link = `${App.rpcExplorer}#?method=getrawtransaction&params=["${txid}",1]&submit`;
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

		let changeAddress = changeAddrs[0];
		let burn = 0;
		let txInfo = await App._createMemoTx({
			burn,
			memo,
			message,
			changeAddress,
		});
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
	App._signMemo = async function ({
		burn = 0,
		memo = null,
		message = null,
		collateral = 0,
		changeAddress,
	}) {
		let txInfo = await App._createMemoTx({
			burn,
			memo,
			message,
			collateral,
			changeAddress,
		});

		let signedTx = await dashTx.hashAndSignAll(txInfo);
		console.log("memo signed", signedTx);

		let now = Date.now();
		for (let input of txInfo.inputs) {
			input.reserved = now;
		}
		for (let output of txInfo.outputs) {
			output.reserved = now;
		}
		return signedTx;
	};

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
		if (txInfo.changeIndex >= 0) {
			let realChange = txInfo.outputs[txInfo.changeIndex];
			realChange.address = changeAddress;
			let pkhBytes = await DashKeys.addrToPkh(realChange.address, {
				version: App.network,
			});
			realChange.pubKeyHash = DashKeys.utils.bytesToHex(pkhBytes);
		}
		memoOutput.satoshis -= collateral; // adjusting for fee
		console.log("DEBUG memo txInfo", txInfo);

		txInfo.inputs.sort(DashTx.sortInputs);
		txInfo.outputs.sort(DashTx.sortOutputs);

		return txInfo;
	};

	App._signCollateral = async function (collateral = DashJoin.MIN_COLLATERAL) {
		let changeAddress = changeAddrs.shift();
		if (!changeAddress) {
			throw new Error("ran out of change addresses (refresh page)");
		}
		let signedTx = await App._signMemo({
			burn: 0,
			memo: "",
			message: null,
			collateral: DashJoin.MIN_COLLATERAL,
			changeAddress: changeAddress,
		});
		console.log("collat signed", signedTx);
		let signedTxBytes = DashTx.utils.hexToBytes(signedTx.transaction);
		return signedTxBytes;
	};

	/**
	 * @param {Array<import('dashtx').TxInput>?} utxos
	 * @param {Array<import('dashtx').TxInput>} inputs
	 * @param {import('dashtx').TxOutput} output
	 */
	async function draftWalletTx(utxos, inputs, output) {
		let draftTx = dashTx.legacy.draftSingleOutput({ utxos, inputs, output });
		console.log("DEBUG draftTx", draftTx);

		let changeOutput = draftTx.outputs[1];
		if (changeOutput) {
			let address = changeAddrs.shift();
			changeOutput.address = address;
		}

		// See https://github.com/dashhive/DashTx.js/pull/77
		for (let input of draftTx.inputs) {
			let addressInfo = keysMap[input.address];
			Object.assign(input, {
				publicKey: addressInfo.publicKey,
				pubKeyHash: addressInfo.pubKeyHash,
			});
		}
		for (let output of draftTx.outputs) {
			if (output.pubKeyHash) {
				continue;
			}
			if (output.memo) {
				draftTx.feeTarget += output.satoshis;
				output.satoshis = 0;
				continue;
			}
			if (!output.address) {
				if (typeof output.memo !== "string") {
					let err = new Error(`output is missing 'address' and 'pubKeyHash'`);
					window.alert(err.message);
					throw err;
				}
			} else {
				let pkhBytes = await DashKeys.addrToPkh(output.address, {
					version: App.network,
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
			let knownSpent = spentAddrs.includes(input.address);
			if (!knownSpent) {
				spentAddrs.push(input.address);
			}
			removeElement(addresses, input.address);
			removeElement(receiveAddrs, input.address);
			removeElement(changeAddrs, input.address);
			delete deltasMap[input.address];
			dbSet(input.address, null);
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
			removeElement(addresses, output.address);
			removeElement(receiveAddrs, output.address);
			removeElement(changeAddrs, output.address);

			delete deltasMap[output.address];
			dbSet(output.address, null);
		}
		await updateDeltas(updatedAddrs);

		let txid = await DashTx.getId(signedTx.transaction);
		let now = Date.now();
		for (let input of signedTx.inputs) {
			let coin = selectCoin(input.address || "", input.txid, input.outputIndex);
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
				info = { balance: 0, deltas: [] };
				deltasMap[output.address] = info;
			}
			let memCoin = selectCoin(output.address, txid, i);
			if (!memCoin) {
				memCoin = {
					address: output.address,
					satoshis: output.satoshis,
					txid: txid,
					index: i,
				};
				info.deltas.push(memCoin);
			}
		}
	}

	function renderAddresses() {
		$("[data-id=spent-count]").textContent = spentAddrs.length.toString();
		$("[data-id=spent]").textContent = spentAddrs.join("\n");
		$("[data-id=receive-addresses]").textContent = receiveAddrs.join("\n");
		$("[data-id=change-addresses]").textContent = changeAddrs.join("\n");
	}

	/**
	 * @param {String} address
	 * @param {String} txid
	 * @param {Number} index
	 */
	function selectCoin(address, txid, index) {
		let info = deltasMap[address];
		if (!info) {
			let err = new Error(`coins for '${address}' disappeared`);
			window.alert(err.message);
			throw err;
		}
		for (let delta of info.deltas) {
			if (delta.txid !== txid) {
				continue;
			}
			if (delta.index !== index) {
				continue;
			}
			return delta;
		}
	}

	/**
	 * @param {"mainnet"|"testnet"|String} network
	 */
	App.$init = async function (network) {
		App.network = network;
		if (App.network === MAINNET) {
			App.dbPrefix = "";
			App.coinType = COINTYPE_DASH;
			App.hdVersions = DashHd.MAINNET;
			App.rpcExplorer = "https://rpc.digitalcash.dev/";
			App.rpcBaseUrl = `https://api:null@rpc.digitalcash.dev/`;
			App.p2pWebProxyUrl = "wss://p2p.digitalcash.dev/ws";
		} else {
			App.dbPrefix = "testnet-";
			App.coinType = COINTYPE_TESTNET;
			App.hdVersions = DashHd.TESTNET;
			App.rpcExplorer = "https://trpc.digitalcash.dev/";
			App.rpcBaseUrl = `https://api:null@trpc.digitalcash.dev/`;
			App.p2pWebProxyUrl = "wss://tp2p.digitalcash.dev/ws";
		}

		denomsMap = {};

		App.mainnet.maxConns = dbGet(`max-connections`, App.mainnet.maxConns);
		App.testnet.maxConns = dbGet(
			`testnet-max-connections`,
			App.testnet.maxConns,
		);
		let phrases = dbGet(`${App.dbPrefix}wallet-phrases`, []);
		let primaryPhrase = phrases[0];
		if (!primaryPhrase) {
			primaryPhrase = await DashPhrase.generate(128);
			//dbSet(`${App.dbPrefix}wallet-phrases`, [primaryPhrase]);
		}

		let primarySeedBytes = await DashPhrase.toSeed(primaryPhrase, sessionSalt);
		let walletKey = await DashHd.fromSeed(primarySeedBytes);
		let walletId = await DashHd.toId(walletKey);
		let primaryIndex = await dbGet(`wallet-${walletId}-primary-index`, 0);
		let coinjoinIndex = await dbGet(`wallet-${walletId}-coinjoin-index`, 1);
		let firstRoundIndex = await dbGet(`wallet-${walletId}-coinjoin-index`, 2);

		await App._$walletUpdate(
			primaryPhrase,
			sessionSalt,
			primaryIndex,
			coinjoinIndex,
			firstRoundIndex,
		);
		await App._walletDerive(primaryPhrase, sessionSalt, primaryIndex);

		await updateDeltas(addresses);
		renderAddresses();
		renderCoins();

		let $testnets = $$("[data-network=testnet]");
		for (let $testnet of $testnets) {
			$testnet.hidden = App.network === MAINNET;
		}

		siftDenoms();
		renderCashDrawer();
		App.syncCashDrawer();
	};

	App.initP2p = async function () {
		let networkInfo = App.mainnet;
		if (App.network !== MAINNET) {
			networkInfo = App.testnet;
		}
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
			$('[data-name="denomination"]', $row).textContent = session.denomination;
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
	 * @param {String} walletId
	 * @param {Number} accountIndex
	 * @param {import('dashhd').HDKey} key
	 * @param {Number} usage
	 * @param {Number} i
	 */
	async function addKey(walletId, accountIndex, key, usage, i) {
		let wif = await DashHd.toWif(key.privateKey, { version: App.network });
		let address = await DashHd.toAddr(key.publicKey, {
			version: App.network,
		});
		let hdpath = `m/44'/${App.coinType}'/${accountIndex}'/${usage}`; // accountIndex from step 2

		// TODO put this somewhere safe
		// let descriptor = `pkh([${walletId}/${partialPath}/0/${index}])`;

		addresses.push(address);
		if (usage === DashHd.RECEIVE) {
			receiveAddrs.push(address);
		} else if (usage === DashHd.CHANGE) {
			changeAddrs.push(address);
		} else {
			let err = new Error(`unknown usage '${usage}'`);
			throw err;
		}

		// note: pkh is necessary here because 'getaddressutxos' is unreliable
		//       and neither 'getaddressdeltas' nor 'getaddressmempool' have 'script'
		let pkhBytes = await DashKeys.pubkeyToPkh(key.publicKey);
		keysMap[address] = {
			walletId: walletId,
			// account: accountIndex,
			// usage: usage,
			index: i,
			hdpath: hdpath, // useful for multi-account indexing
			address: address, // XrZJJfEKRNobcuwWKTD3bDu8ou7XSWPbc9
			wif: wif, // XCGKuZcKDjNhx8DaNKK4xwMMNzspaoToT6CafJAbBfQTi57buhLK
			key: key,
			publicKey: DashKeys.utils.bytesToHex(key.publicKey),
			pubKeyHash: DashKeys.utils.bytesToHex(pkhBytes),
		};
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
		$("[data-id=cj-balance]").textContent = toFixed(cjAmount, 8);
	}

	/**
	 * @param {Event} event
	 */
	App.denominateCoins = async function (event) {
		event.preventDefault();

		{
			let addrs = Object.keys(deltasMap);
			spendableAddrs.length = 0;

			for (let address of addrs) {
				let info = deltasMap[address];
				if (info.balance === 0) {
					continue;
				}
				spendableAddrs.push(address);
			}
		}

		let slots = dbGet("cash-drawer-control");

		let priorityGroups = groupSlotsByPriorityAndAmount(slots);

		let priorities = Object.keys(priorityGroups);
		priorities.sort(sortNumberDesc);

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

				let utxos = getAllUtxos();
				let coins = DashTx._legacySelectOptimalUtxos(utxos, slot.denom);
				let sats = DashTx.sum(coins);
				if (sats < slot.denom) {
					console.log(`not enough coins for ${slot.denom}`);
					continue;
				}

				let now = Date.now();
				for (let coin of coins) {
					coin.reserved = now;
				}
				slot.need -= 1;

				// TODO DashTx.
				console.log("Found coins to make denom", slot.denom, coins);
				let roundRobiner = createRoundRobin(slots, slot);
				// roundRobiner();

				let address = receiveAddrs.shift();
				let satoshis = slot.denom;
				let output = { satoshis, address };

				void (await confirmAndBroadcastAndCompleteTx(coins, output).then(
					roundRobiner,
				));
			}
		}
	};

	/**
	 * @param {Array<CJSlot>} slots
	 * @param {CJSlot} slot
	 */
	function createRoundRobin(slots, slot) {
		return function () {
			if (slot.need >= 1) {
				// round-robin same priority
				slots.push(slot);
			}
		};
	}

	/**
	 * @param {Array<import('dashtx').TxInput>} inputs
	 * @param {import('dashtx').TxOutput} output
	 */
	async function confirmAndBroadcastAndCompleteTx(inputs, output) {
		let utxos = null;
		let draft = await draftWalletTx(utxos, inputs, output);

		let signedTx = await dashTx.legacy.finalizePresorted(draft.tx);
		{
			console.log("DEBUG confirming signed tx", signedTx);
			let amount = output.satoshis / SATS;
			let amountStr = toFixed(amount, 4);
			let confirmed = window.confirm(
				`Really send ${amountStr} to ${output.address}?`,
			);
			if (!confirmed) {
				return;
			}
		}

		void (await App._$commitWalletTx(signedTx));
	}

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
		return 0;
	}

	/**
	 * @param {Array<String>} addrs
	 */
	async function updateDeltas(addrs) {
		for (let address of addrs) {
			let info = dbGet(address);
			let isSpent = info && info.deltas?.length && !info.balance;
			if (!isSpent) {
				continue; // used address (only check on manual sync)
			}

			let knownSpent = spentAddrs.includes(address);
			if (!knownSpent) {
				spentAddrs.push(address);
			}
			removeElement(addrs, info.address);
			removeElement(addresses, info.address);
			removeElement(receiveAddrs, info.address);
			removeElement(changeAddrs, info.address);
		}

		let deltaLists = await Promise.all([
			// See
			// - <https://trpc.digitalcash.dev/#?method=getaddressdeltas&params=[{"addresses":["ybLxVb3aspSHFgxM1qTyuBSXnjAqLFEG8P"]}]&submit>
			// - <https://trpc.digitalcash.dev/#?method=getaddressmempool&params=[{"addresses":["ybLxVb3aspSHFgxM1qTyuBSXnjAqLFEG8P"]}]&submit>
			await App.rpc("getaddressdeltas", { addresses: addrs }),
			// TODO check for proof of instantsend / acceptance
			await App.rpc("getaddressmempool", { addresses: addrs }),
		]);
		for (let deltaList of deltaLists) {
			for (let delta of deltaList) {
				console.log("DEBUG delta", delta);
				removeElement(addrs, delta.address);
				removeElement(addresses, delta.address);
				removeElement(receiveAddrs, delta.address);
				removeElement(changeAddrs, delta.address);
				if (!deltasMap[delta.address]) {
					deltasMap[delta.address] = { balance: 0, deltas: [] };
				}
				deltasMap[delta.address].deltas.push(delta);
				deltasMap[delta.address].balance += delta.satoshis;
			}
		}
	}

	function renderCoins() {
		let addrs = Object.keys(deltasMap);
		for (let addr of addrs) {
			let info = deltasMap[addr];
			dbSet(addr, info);
		}

		let utxos = getAllUtxos();
		utxos.sort(sortCoinsByDenomAndSatsDesc);

		requestAnimationFrame(function () {
			let elementStrs = [];
			let template = $("[data-id=coin-row-tmpl]").content;
			for (let utxo of utxos) {
				let amount = utxo.satoshis / SATS;
				Object.assign(utxo, { amount: amount });

				let clone = document.importNode(template, true);
				if (!clone.firstElementChild) {
					throw new Error(`coin row template missing child`);
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
				} else {
					//
				}
				$("[data-name=txid]", clone).textContent = utxo.txid;
				$("[data-name=output-index]", clone).textContent = utxo.index;

				elementStrs.push(clone.firstElementChild.outerHTML);
				//tableBody.appendChild(clone);
			}

			let totalBalance = DashTx.sum(utxos);
			let totalAmount = totalBalance / SATS;
			$("[data-id=total-balance]").innerText = toFixed(totalAmount, 4);

			let $coinsTable = $("[data-id=coins-table]");
			$coinsTable.textContent = "";
			$coinsTable.insertAdjacentHTML("beforeend", elementStrs.join("\n"));
			//$('[data-id=balances]').innerText = balances.join('\n');

			if (totalBalance >= MIN_BALANCE) {
				$('[data-id="load-balance"]').hidden = true;
				return;
			}

			let [dashAmount, dustAmount] = App._splitBalance(totalBalance);
			let loadAddr = receiveAddrs[0]; // TODO reserve
			let addrQr = new QRCode({
				content: `dash:${loadAddr}?`, // leave amount blank
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
			$('[data-id="load-addr"]').textContent = loadAddr;
			$('[data-id="load-qr"]').textContent = "";
			$('[data-id="load-qr"]').insertAdjacentHTML("beforeend", addrSvg);
			$('[data-id="load-balance-button"]').dataset.address = loadAddr;
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

				console.log("DEBUG denom", denom, coin);
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
		let networkInfo = App.mainnet;
		if (App.network !== MAINNET) {
			networkInfo = App.testnet;
		}

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
			p2pWebProxyUrl = App.p2pWebProxyUrl;
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

		let senddsqBytes = DashJoin.packers.senddsq({ network: App.network });
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
	 * @param {Number} denomination
	 * @param {Array<FullCoin>} inputs
	 * @param {Array<import('dashtx').TxOutput>} outputs
	 */
	async function assertDenomination(denomination, inputs, outputs) {
		for (let input of inputs) {
			let satoshis = input.satoshis;
			if (satoshis !== denomination) {
				let msg = `utxo.satoshis (${satoshis}) must match requested denomination ${denomination}`;
				throw new Error(msg);
			}
		}
		for (let output of outputs) {
			if (!output.satoshis) {
				output.satoshis = denomination;
				continue;
			}
			if (output.satoshis !== denomination) {
				let msg = `output.satoshis (${output.satoshis}) must match requested denomination ${denomination}`;
				throw new Error(msg);
			}
		}
	}

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
			let dsiBytes = DashJoin.packers.dsi(dsiInfo);
			console.log(`DEBUG dsi bytes`, p2pHost._host, p2pHost._network, dsiBytes);
			p2pHost.send(dsiBytes);
			notify("send", "dsi");

			let msg = await evstream.once("dsf");
			notify("receive", "dsf", msg);

			console.log("DEBUG dsf %c[[MSG]]", "color: blue", msg);
			let dsfTxRequest = DashJoin.parsers.dsf(msg.payload);
			console.log("DEBUG dsf", dsfTxRequest, inputs);

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

	App.createCoinJoinSession = async function () {
		let $coins = $$("[data-name=coin]:checked");
		if (!$coins.length) {
			let msg =
				"Use the Coins table to select which coins to include in the CoinJoin session.";
			window.alert(msg);
			return;
		}

		let inputs = [];
		let outputs = [];
		let denom;
		for (let $coin of $coins) {
			let [address, txid, indexStr] = $coin.value.split(",");
			let index = parseInt(indexStr, 10);
			let coin = selectCoin(address, txid, index);
			coin.denom = DashJoin.getDenom(coin.satoshis);
			if (!coin.denom) {
				let msg = "CoinJoin requires 10s-Denominated coins, shown in BOLD.";
				window.alert(msg);
				return;
			}
			if (!denom) {
				denom = coin.denom;
			}
			if (coin.denom !== denom) {
				let msg =
					"CoinJoin requires all coins to be of the same denomination (ex: three 0.01, or two 1.0, but not a mix of the two).";
				window.alert(msg);
				return;
			}
			Object.assign(coin, { outputIndex: coin.index });
			inputs.push(coin);

			let output = {
				address: receiveAddrs.shift(),
				satoshis: denom,
				pubKeyHash: "",
			};
			let pkhBytes = await DashKeys.addrToPkh(output.address, {
				version: App.network,
			});
			output.pubKeyHash = DashKeys.utils.bytesToHex(pkhBytes);
			outputs.push(output);
		}

		assertDenomination(denom, inputs, outputs);

		let collateralTxes = [
			await App._signCollateral(DashJoin.MIN_COLLATERAL),
			await App._signCollateral(DashJoin.MIN_COLLATERAL),
		];

		let networkInfo = App.mainnet;
		if (App.network !== MAINNET) {
			networkInfo = App.testnet;
		}

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
			let p2pPromise = CJ.connectToBestNode(
				networkInfo.network,
				denomination,
			).then(function (p2pHost) {
				_p2pHost = p2pHost;
			});
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
				networkInfo.network,
				denomination,
				p2pHost,
				inputs,
				outputs,
				collateralTxes,
				notify,
			);
			let joinTimeout = sleep(timeout).then(function () {
				if (!session.dsc) {
					session.dssu = "(timeout)";
				}
			});
			await Promise.race([joinPromise, joinTimeout]);
		} catch (e) {
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

	main().catch(function (err) {
		console.error(`Error in main:`, err);
	});
})();

/**
 * @typedef FullCoin
 * @prop {String} address
 * @prop {Number} satoshis
 * @prop {Hex} txid
 * @prop {Number} index
 * @prop {Number} outputIndex
 * @prop {Number} denom
 * @prop {Hex} publicKey
 * @prop {Hex} pubKeyHash
 */

/**
 * @typedef MemCoin
 * @prop {String} address
 * @prop {Number} satoshis
 * @prop {Hex} txid
 * @prop {Number} index
 */

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
