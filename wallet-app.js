(function () {
	"use strict";

	//@ts-expect-error
	let QRCode = window.QRCode;

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

	//@ts-expect-error
	let DashJoin = window.DashJoin;
	//@ts-expect-error
	let DashP2P = window.DashP2P;

	let App = {};
	//@ts-expect-error
	window.App = App;

	let P2P = {};
	//@ts-expect-error
	window.P2P = P2P;

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

	/** @type {Object.<Number, NodeStat>} */
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
	 * @prop {Object.<Number, NodeStat>} coinjoinQueues
	 * @prop {Array<MasternodeShort>} _rawmnlist
	 * @prop {ChainInfo} _chaininfo
	 * @prop {Array<MasternodeShort>} _evonodes
	 * @prop {Object.<String, ReturnType<typeof DashP2P.create>>} peers
	 */

	/** @type {NetworkInfo} */
	App.mainnet = {
		network: "mainnet",
		maxConns: 3,
		initialized: false,
		coinjoinQueues: globalThis.structuredClone(emptyCoinjoinQueues),
		_rawmnlist: [],
		_chaininfo: {
			blocks: 0, // height
		},
		/** @type {Array<MasternodeShort>} */
		_evonodes: [],
		/** @type {Object.<String, ReturnType<typeof DashP2P.create>>} */
		peers: {},
	};

	/** @type {NetworkInfo} */
	App.testnet = {
		network: "testnet",
		maxConns: 3,
		initialized: false,
		coinjoinQueues: globalThis.structuredClone(emptyCoinjoinQueues),
		_rawmnlist: [],
		_chaininfo: {
			blocks: 0, // height
		},
		/** @type {Array<MasternodeShort>} */
		_evonodes: [],
		/** @type {Object.<String, ReturnType<typeof DashP2P.create>>} */
		peers: {},
	};

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

		await dbSet(`max-connections`, maxConn);
		await dbSet(`testnet-max-connections`, maxConn);

		await dbSet("network", App.network);

		await App.$init(App.network);
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
			// await App._$walletUpdate(phrase, salt, accountIndex);
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
	 * @param {Number} accountIndex
	 */
	App._$walletUpdate = async function (phrase, salt, accountIndex) {
		sessionSalt = salt || "";

		let seedBytes = await DashPhrase.toSeed(phrase, sessionSalt);
		let seedHex = DashKeys.utils.bytesToHex(seedBytes);

		$('[name="walletPhrase"]').value = phrase;
		$('[name="walletSeed"]').value = seedHex;
		$('[name="walletAccount"]').value = accountIndex.toString();
		$("[data-id=wallet-path]").value =
			`m/44'/${App.coinType}'/${accountIndex}'`;

		// $('[name="walletPhrase"]').type = "password"; // delayed to avoid pw prompt
		$('[name="walletSeed"]').type = "password"; // delayed to avoid pw prompt
		// $('[name="phraseSalt"]').type = "password"; // delayed to avoid pw prompt
	};

	/**
	 * @param {String} phrase
	 * @param {String} salt
	 * @param {Number} accountIndex
	 */
	App._walletDerive = async function (phrase, salt, accountIndex) {
		// reset all key & address state
		addresses = [];
		changeAddrs = [];
		receiveAddrs = [];
		spentAddrs = [];
		spendableAddrs = [];
		deltasMap = {};
		keysMap = {};

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

		let previousIndex = 0;
		let last = previousIndex + 50;
		for (let i = previousIndex; i < last; i += 1) {
			let failed;
			try {
				let receiveKey = await xprvReceiveKey.deriveAddress(i); // xprvKey from step 2
				await addKey(walletId, accountIndex, receiveKey, DashHd.RECEIVE, i);
			} catch (e) {
				failed = true;
			}
			try {
				let changeKey = await xprvChangeKey.deriveAddress(i); // xprvKey from step 2
				addKey(walletId, accountIndex, changeKey, DashHd.CHANGE, i);
			} catch (e) {
				failed = true;
			}
			if (failed) {
				// to make up for skipping on error
				last += 1;
			}
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

		let $coins = $$("[data-name=coin]:checked");
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

		if (!utxos) {
			throw new Error(`type fail: utxos not set`);
		}
		if (!inputs) {
			throw new Error(`type fail: inputs not set`);
		}
		let output = { satoshis, address };
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
	App.sendMemo = async function (event) {
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

		let signedTx = await App._signMemo({ burn, memo, message });
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

	/**
	 * @param {Object} opts
	 * @param {Number} [opts.burn=0]
	 * @param {String?} [opts.memo=null]
	 * @param {String?} [opts.message=null]
	 * @param {Number} [opts.collateral=0]
	 */
	App._signMemo = async function ({
		burn = 0,
		memo = null,
		message = null,
		collateral = 0,
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
			realChange.address = changeAddrs.shift();
			let pkhBytes = await DashKeys.addrToPkh(realChange.address, {
				version: App.network,
			});
			realChange.pubKeyHash = DashKeys.utils.bytesToHex(pkhBytes);
		}
		memoOutput.satoshis -= collateral; // adjusting for fee
		console.log("DEBUG", txInfo);

		let now = Date.now();
		for (let input of txInfo.inputs) {
			input.reserved = now;
		}
		for (let output of txInfo.outputs) {
			output.reserved = now;
		}

		txInfo.inputs.sort(DashTx.sortInputs);
		txInfo.outputs.sort(DashTx.sortOutputs);

		let signedTx = await dashTx.hashAndSignAll(txInfo);
		console.log("memo signed", signedTx);
		return signedTx;
	};

	App._signCollateral = async function (collateral = DashJoin.MIN_COLLATERAL) {
		let signedTx = await App._signMemo({
			burn: 0,
			memo: "",
			message: null,
			collateral: DashJoin.MIN_COLLATERAL,
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
		let accountIndex = await dbGet(`wallet-${walletId}-account-index`, 0);

		await App._$walletUpdate(primaryPhrase, sessionSalt, accountIndex);
		await App._walletDerive(primaryPhrase, sessionSalt, accountIndex);

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
			networkInfo._rawmnlist = await App.rpc("masternodelist");
			networkInfo._chaininfo = await App.rpc("getblockchaininfo");
			networkInfo._evonodes = DashJoin.utils._evonodeMapToList(
				networkInfo._rawmnlist,
			);
			networkInfo.initialized = true;
		}

		console.log(`DEBUG evonodes (raw, as map)`, networkInfo._rawmnlist);

		for (;;) {
			let hostnames = Object.keys(networkInfo.peers);
			if (hostnames.length >= networkInfo.maxConns) {
				break;
			}

			let rnd = Math.random();
			let index = Math.floor(rnd * networkInfo._evonodes.length);
			let evonode = networkInfo._evonodes[index];
			// { host, hostname, port }

			// networkInfo.peers[evonode.host].connection.close();

			console.info("[info] chosen evonode:", evonode.host);
			void (await P2P.connectToPeer(
				evonode,
				networkInfo._chaininfo.blocks,
			).catch(onConnError));
		}

		for (;;) {
			let hostnames = Object.keys(networkInfo.peers);
			if (hostnames.length <= networkInfo.maxConns) {
				break;
			}

			let hostname = hostnames.shift() || "";
			let host = networkInfo.peers[hostname];
			console.log(
				`DEBUG host '${hostname}' '${hostnames}'`,
				host,
				networkInfo.peers,
			);
			delete networkInfo.peers[hostname];
			host.connection?.close();
		}

		void App._$renderPoolInfo();
	};

	/** @param {Error} err */
	function onConnError(err) {
		console.error(`[onConnError]`, err);
	}

	App._$renderPoolInfo = function () {
		/**
		 * @typedef QueueStat
		 * @prop {Number} count
		 * @prop {Number} delay
		 * @prop {Number} at
		 */

		/**
		 * @typedef QueueStats
		 * @prop {Object.<Number, QueueStat>} mainnet
		 * @prop {Object.<Number, QueueStat>} testnet
		 */

		/** @type {QueueStats} */
		let queueStats = {
			mainnet: {
				1000010000: { count: 0, delay: 0, at: 0 },
				100001000: { count: 0, delay: 0, at: 0 },
				10000100: { count: 0, delay: 0, at: 0 },
				1000010: { count: 0, delay: 0, at: 0 },
				100001: { count: 0, delay: 0, at: 0 },
			},
			testnet: {
				1000010000: { count: 0, delay: 0, at: 0 },
				100001000: { count: 0, delay: 0, at: 0 },
				10000100: { count: 0, delay: 0, at: 0 },
				1000010: { count: 0, delay: 0, at: 0 },
				100001: { count: 0, delay: 0, at: 0 },
			},
		};

		let d = new Date();
		let now = d.valueOf();
		let today = d.toLocaleDateString();

		let template = $(`[data-id="connection-row-template"]`).content;
		let tableBody = $(`[data-id="connections-table-body"]`);
		let $denomsTable = $(`[data-id="denominations-table-body"]`);

		let $rows = document.createDocumentFragment();
		let networks = [App.mainnet, App.testnet];
		for (let networkInfo of networks) {
			let stats = queueStats.mainnet;
			if (networkInfo.network !== "mainnet") {
				stats = queueStats.testnet;
			}

			for (let denom of DashJoin.DENOMS) {
				let stat = stats[denom];
				stat.count = 0;

				let cjQueue = networkInfo.coinjoinQueues[denom];

				let queues = Object.values(cjQueue);
				for (let dsqStatus of queues) {
					let isTooLate = dsqStatus.ready;
					if (isTooLate) {
						continue;
					}

					if (dsqStatus._prevMs) {
						let delay = dsqStatus._ms - dsqStatus._prevMs;
						delay = delay / 1000;
						delay = Math.round(delay);
						stat.delay = delay;
					}
					stat.at = dsqStatus._ms;
					console.log(`[DEBUG] ms`, stat.at);

					let staleTime = 15000; // TODO what's a good number for this?
					let age = now - stat.at;
					if (age > staleTime) {
						continue;
					}

					stat.count += 1;
				}
			}

			let hosts = Object.keys(networkInfo.peers);
			for (let host of hosts) {
				let $row = document.importNode(template, true);

				let connInfo = networkInfo.peers[host];
				let hostInfo = networkInfo.peers[host].node;
				let day = connInfo.connectedAt.toLocaleDateString();
				let time = connInfo.connectedAt.toLocaleTimeString();
				let connectedAt = time;
				if (day !== today) {
					connectedAt = day;
				}
				$(`[data-name="network"]`, $row).textContent = networkInfo.network;
				$(`[data-name="hostname"]`, $row).textContent = hostInfo.hostname;
				$(`[data-name="port"]`, $row).textContent = hostInfo.port;
				$(`[data-name="type"]`, $row).textContent = hostInfo.type;
				$(`[data-name="connected-at"]`, $row).textContent = connectedAt;

				let latestTime = connInfo.latestAt.toLocaleTimeString();
				$(`[data-name="last-message-at"]`, $row).textContent = latestTime;

				$rows.appendChild($row);
			}
		}

		requestAnimationFrame(function () {
			$renderNodesList(`[data-id="mainnet-nodes"]`, App.mainnet._evonodes);
			$renderNodesList(`[data-id="testnet-nodes"]`, App.testnet._evonodes);

			for (let _denom of DashJoin.DENOMS) {
				let denom = _denom.toString();
				let $denomRow = $(`[data-id="denom-${denom}"]`, $denomsTable);

				let mainnetStat = queueStats.mainnet[denom];
				$(`[data-name="mainnet-pools"]`, $denomRow).textContent =
					mainnetStat.count;
				if (mainnetStat.delay) {
					$(`[data-name="mainnet-delay"]`, $denomRow).textContent =
						`${mainnetStat.delay}s`;
				}
				if (mainnetStat.at) {
					let latestDate = new Date(mainnetStat.at);
					$(`[data-name="mainnet-at"]`, $denomRow).textContent =
						latestDate.toLocaleTimeString();
				}

				let testnetStat = queueStats.testnet[denom];
				$(`[data-name="testnet-pools"]`, $denomRow).textContent =
					testnetStat.count;
				if (testnetStat.delay) {
					$(`[data-name="testnet-delay"]`, $denomRow).textContent =
						`${testnetStat.delay}s`;
				}
				if (testnetStat.at) {
					let latestDate = new Date(mainnetStat.at);
					$(`[data-name="testnet-at"]`, $denomRow).textContent =
						latestDate.toLocaleTimeString();
				}
			}

			tableBody.replaceChildren($rows);
		});
	};

	/**
	 * @param {String} sel
	 * @param {Array<MasternodeShort>} nodes
	 */
	function $renderNodesList(sel, nodes) {
		let oldList = $(sel).textContent;

		let rows = [];
		for (let node of nodes) {
			// console.log(`DEBUG mnshort`, node);
			// '107.170.254.160:9999'.length
			let host = node.host.padStart(20, " ");
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
			window.alert(err.message);
			throw err;
		}

		// note: pkh is necessary here because 'getaddressutxos' is unreliable
		//       and neither 'getaddressdeltas' nor 'getaddressmempool' have 'script'
		let pkhBytes = await DashKeys.pubkeyToPkh(key.publicKey);
		keysMap[address] = {
			walletId: walletId,
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

			let tableBody = $("[data-id=coins-table]");
			tableBody.textContent = "";
			tableBody.insertAdjacentHTML("beforeend", elementStrs.join("\n"));
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
	 * @param {MasternodeShort} evonode
	 * @param {Number} height
	 */
	P2P.connectToPeer = async function (evonode, height) {
		let networkInfo = App.mainnet;
		if (App.network !== MAINNET) {
			networkInfo = App.testnet;
		}

		if (networkInfo.peers[evonode.host]) {
			return;
		}

		let p2p = DashP2P.create();

		let query = {
			access_token: "secret",
			hostname: evonode.hostname,
			port: evonode.port,
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
			hostname: evonode.hostname,
			port: evonode.port,
			start_height: height,
		});

		let senddsqBytes = DashJoin.packers.senddsq({ network: App.network });
		console.log("[REQ: %csenddsq%c]", "color: $55daba", "color: inherit");
		p2p.send(senddsqBytes);

		void p2p.createSubscriber(
			["dsq"],
			/**
			 * @param {any} evstream
			 */
			async function (evstream) {
				let msg = await evstream.once("dsq");
				let dsq = DashJoin.parsers.dsq(msg.payload);
				if (dsq.ready) {
					console.log(
						"%c[DEBUG dsq ready]",
						"color: #bada55",
						`parsed dsq`,
						dsq,
					);
				} else {
					console.log("%c[DEBUG dsq]", `parsed dsq`, dsq);
				}

				let prevDsqStatus =
					networkInfo.coinjoinQueues[dsq.denomination][evonode.host];
				let prevTimestamp = prevDsqStatus?.timestamp || "1970-01-01T00:00:00Z";
				let prevDate = new Date(prevTimestamp);
				let curDate = new Date(dsq.timestamp);

				let dsqStatus = {
					// node info
					host: evonode.host,
					hostname: evonode.hostname,
					port: evonode.port,
					// dsq status
					denomination: dsq.denomination,
					ready: dsq.ready,
					timestamp: dsq.timestamp,
					timestamp_unix: dsq.timestamp_unix,
					_prevDate: prevDate,
					_prevMs: prevDate.valueOf(),
					_date: curDate,
					_ms: curDate.valueOf(),
				};

				networkInfo.coinjoinQueues[dsq.denomination][evonode.host] = dsqStatus;
				console.log(
					"%c[[DSQ]]",
					"color: #bada55",
					dsqStatus.denomination,
					dsqStatus.ready,
					dsqStatus.host,
				);

				networkInfo.peers[evonode.host].latestAt = new Date();

				void App._$renderPoolInfo();
			},
		);

		/**
		 * @param {Error} err
		 */
		function cleanup(err) {
			console.error("[cj ws cleanup]:", err);
			delete networkInfo.peers[evonode.host];
			for (let denom of DashJoin.DENOMS) {
				delete networkInfo.coinjoinQueues[denom][evonode.host];
			}
			p2p.close();
		}
		//@ts-expect-error
		wsc.addEventListener("error", cleanup);
		//@ts-expect-error
		wsc.addEventListener("close", cleanup);

		let d = new Date();
		networkInfo.peers[evonode.host] = {
			connection: p2p,
			connectedAt: d,
			latestAt: d,
			node: evonode,
		};
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
	/**
	 * @param {Array<FullCoin>} inputs
	 * @param {Array<import('dashtx').TxOutput>} outputs
	 * @param {Array<import('dashtx').TxSummary>} collateralTxes
	 */
	async function createCoinJoinSession(
		inputs, // [{address, txid, pubKeyHash, ...getPrivateKeyInfo }]
		outputs, // [{ pubKeyHash, satoshis }]
		collateralTxes, // (for dsa and dsi) any 2 txes having fees >=0.00010000 more than necessary
	) {
		let networkInfo = App.mainnet;
		if (App.network !== MAINNET) {
			networkInfo = App.testnet;
		}

		// TODO
		// TODO lookup pool info to determine a cj node to engage with
		// TODO

		let rnd = Math.random();
		let index = Math.floor(rnd * networkInfo._evonodes.length);
		let evonode = networkInfo._evonodes[index];
		let p2p = networkInfo.peers[evonode.host];
		if (!p2p) {
			throw new Error(`'${evonode.host}' is not connected`);
		}

		let denomination = inputs[0].satoshis;
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

		// todo: pick a smaller size that matches the dss
		let message = new Uint8Array(DashP2P.PAYLOAD_SIZE_MAX);
		let evstream = p2p.createSubscriber(["dssu", "dsq", "dsf", "dsc"]);

		{
			let collateralTx = collateralTxes.shift();
			let dsa = {
				network: networkInfo.network,
				message: message,
				denomination: denomination,
				collateralTx: collateralTx,
			};
			let dsaBytes = DashJoin.packers.dsa(dsa);
			console.log("DEBUG dsa, dsaBytes", dsa, dsaBytes);
			p2p.send(dsaBytes);
			for (;;) {
				let msg = await evstream.once();

				if (msg.command === "dsq") {
					let dsq = DashJoin.parsers.dsq(msg.payload);
					if (dsq.denomination !== denomination) {
						continue;
					}
					if (!dsq.ready) {
						continue;
					}
					break;
				}

				if (msg.command === "dssu") {
					let dssu = DashJoin.parsers.dssu(msg.payload);
					if (dssu.state === "ERROR") {
						evstream.close();
						throw new Error();
					}
				}
			}
		}

		let dsfTxRequest;
		{
			let collateralTx = collateralTxes.shift();
			let dsiBytes = DashJoin.packers.dsi({
				network: networkInfo.network,
				message: message,
				inputs: inputs,
				collateralTx: collateralTx,
				outputs: outputs,
			});
			p2p.send(dsiBytes);
			let msg = await evstream.once("dsf");
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
				network: networkInfo.network,
				message: message,
				inputs: signedInputs,
			});
			p2p.send(dssBytes);
			void (await evstream.once("dsc"));
		}

		return dsfTxRequest;
	}

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

		let collateralTxes = [
			await App._signCollateral(DashJoin.MIN_COLLATERAL),
			await App._signCollateral(DashJoin.MIN_COLLATERAL),
		];

		await createCoinJoinSession(
			inputs, // [{address, txid, pubKeyHash, ...getPrivateKeyInfo }]
			outputs, // [{ pubKeyHash, satoshis }]
			collateralTxes, // any tx with fee >= 0.00010000
		);
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
 * @typedef NodeStat
 * @prop {String} host
 * @prop {String} hostname
 * @prop {Number} port
 * @prop {Number} denomination
 * @prop {Boolean} ready
 * @prop {String} timestamp - ISO string
 * @prop {Number} timestamp_unix - seconds since epoch
 * @prop {Date} _prevDate
 * @prop {Number} _prevMs
 * @prop {Date} _date
 * @prop {Number} _ms
 */

/**
 * @typedef MasternodeShort
 * @prop {String} id
 * @prop {String} type
 * @prop {String} host - "address"
 * @prop {String} hostname
 * @prop {String} port
 * @prop {String} pubkeyoperator
 */

/**
 * @typedef Masternode
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
