const crypto = require('crypto');
const fs = require('fs');
const csvParser = require('csv-parser');
const axios = require('axios');
const ethers = require('ethers');
const { getKeyFromUser } = require('../../utils/utils.js');
const config = require('../../config/runner.json');
const abi = require('./abi.json');
const { createLogger, transports, format, http } = require('winston');
const { HttpsProxyAgent } = require('https-proxy-agent');
const agent = new HttpsProxyAgent(config.proxy);

const logger = createLogger({
    format: format.combine(
        format.colorize(),
        format.timestamp({ format: 'HH:mm:ss' }),
        format.printf(info => `${info.timestamp} | ${info.level}: ${info.message}`)
    ),
    transports: [
        new transports.Console(),
    ]
});

const contractABI = [
    "constructor(address gateway)",
    "function onGmpReceived(bytes32 id, uint128 network, bytes32 source, bytes calldata payload) external payable returns (bytes32)",
    "function number() view returns (uint256)"
];

const contractBytecode = abi.bytecode;
const gateway = "0xb5d83c2436ad54046d57cd48c00d619d702f3814";

function decrypt(text, secretKey) {
    let parts = text.split(':');
    let iv = Buffer.from(parts.shift(), 'hex');
    let encryptedText = Buffer.from(parts.join(':'), 'hex');
    let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(secretKey), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

async function deployContract(wallet) {
    const factory = new ethers.ContractFactory(contractABI, contractBytecode, wallet);

    const gasPrice = await wallet.provider.getGasPrice();
    const deployTransaction = factory.getDeployTransaction(gateway);
    const estimatedGas = await factory.signer.estimateGas(deployTransaction);
    const increasedGasLimit = estimatedGas.mul(130).div(100);
    const increasedGasPrice = gasPrice.mul(130).div(100);

    const options = {
        gasLimit: increasedGasLimit,
        gasPrice: increasedGasPrice
    };

    try {
        const contract = await factory.deploy(gateway, options);
        logger.info('等待合约部署...');
        const txHash = contract.deployTransaction.hash;
        logger.info(`交易哈希: ${txHash}`);
        const receipt = await wallet.provider.waitForTransaction(txHash);
        if (receipt.status === 1) {
            logger.info(`合约部署成功: ${receipt.contractAddress}`);
            return receipt.contractAddress;
        } else {
            logger.error('交易未能成功上链');
            return false;
        }
    } catch (error) {
        logger.error(`合约部署失败: ${error.message}`);
        return false;
    }
}

async function verifyContract(contractAddress, maxRetries = 5 ) { // maxRetries = 5 为默认值,自行修改
    const url = `https://eth-sepolia.blockscout.com/api/v2/smart-contracts/${contractAddress}/verification/via/flattened-code`;
    const params = {
        "compiler_version": "v0.8.25+commit.b61c2a91",
        "source_code": `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\ninterface IGmpReceiver {\n    /**\n     * @dev Handles the receipt of a single GMP message。\n     * The contract must verify the msg.sender, it must be the Gateway Contract address。\n     *\n     * @param id The EIP-712 hash of the message payload, used as GMP unique identifier\n     * @param network The chain_id of the source chain that send the message\n     * @param source The pubkey/address which sent the GMP message\n     * @param payload The message payload with no specified format\n     * @return 32-byte result, which will be stored together with the GMP message\n     */\n    function onGmpReceived(bytes32 id, uint128 network, bytes32 source, bytes calldata payload)\n        external\n        payable\n        returns (bytes32);\n}\n\ncontract Counter is IGmpReceiver {\n    // sepolia 0xB5D83c2436Ad54046d57Cd48c00D619D702F3814\n    // shibuya 0xF871c929bE8Cd8382148C69053cE5ED1a9593EA7\n    address private immutable _gateway;\n    uint256 public number;\n\n    constructor(address gateway) {\n        _gateway = gateway;\n    }\n\n    function onGmpReceived(bytes32, uint128, bytes32, bytes calldata) external payable override returns (bytes32) {\n        require(msg.sender == _gateway, \"unauthorized\");\n        number++;\n        return bytes32(number);\n    }\n}`,
        "is_optimization_enabled": false,
        "is_yul_contract": false,
        "optimization_runs": "200",
        "evm_version": "default",
        "autodetect_constructor_args": false,
        "constructor_args": "",
        "license_type": "none"
    };

    const requestConfig = {
        httpsAgent: agent,
        httpAgent: agent,
        timeout: 10000, // 设置超时
        method: 'post',
        data: params
    };

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            logger.info(`开始验证合约: ${contractAddress} (尝试第 ${attempt} 次)`);

            const response = await axios(url, requestConfig);
            
            if (response.status === 200 && response.data) {
                logger.info(`合约验证成功: ${response.data.message || '成功'}`);
                return true;
            } else {
                logger.error(`合约验证失败，状态码: ${response.status}, 响应: ${response.data}`);
                return false;
            }
        } catch (error) {
            if (attempt < maxRetries) {
                logger.warn(`验证发生错误: ${error.message}，重试...`);
            } else {
                logger.error(`验证发生错误: ${error.message}`);
                return false;
            }
        }
    }
}



function generateRandomHex() {
    const minLength = 6;
    const maxLength = 9;
    let length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
    if (length % 2 !== 0) {
        length += 1;
    }
    let result = '0x';
    for (let i = 0; i < length; i++) {
        result += Math.floor(Math.random() * 16).toString(16);
    }
    return result;
}

async function subMsg(wallet, generateRandomHex) {
    const address = wallet.address;
    const contractAddress = "0xB5D83c2436Ad54046d57Cd48c00D619D702F3814";
    const abi = [{"inputs": [{"internalType": "address","name": "recipient","type": "address"},{"internalType": "uint16","name": "network","type": "uint16"},{"internalType": "uint256","name": "gasLimit","type": "uint256"},{"internalType": "bytes","name": "data","type": "bytes"}],"name": "submitMessage","outputs": [],"stateMutability": "payable","type": "function"}];
    const contract = new ethers.Contract(contractAddress, abi, wallet);
    const randomHex = generateRandomHex();

    let tx = await contract.submitMessage(
        address, 
        1, 
        100000, 
        randomHex,
    );
    await tx.wait();
    logger.info(`发送消息成功: ${tx.hash}`);
    return tx.hash;

}

async function saveResult(walletAddress, contractAddress, status, txHash) {
    const filePath = 'ContractAdd.csv';
    const header = '钱包地址,合约地址,状态,交易哈希\n';

    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, header);
    }

    fs.appendFile(filePath, `${walletAddress},${contractAddress},${status ? 'Success' : 'Failure'},${txHash}\n`, function (err) {
        if (err) {
            logger.error(`写入 CSV 文件失败: ${err.message}`);
        } else {
            logger.info(`保存结果到 CSV 文件: 钱包地址: ${walletAddress}, 合约地址: ${contractAddress}, 状态: ${status ? 'Success' : 'Failure'}, 交易哈希: ${txHash}`);
        }
    });
}

async function main() {
    const secretKey = getKeyFromUser();
    const wallets = [];

    fs.createReadStream(config.walletPath)
        .pipe(csvParser())
        .on('data', (row) => {
            const decryptedPrivateKey = decrypt(row.privateKey, secretKey);
            wallets.push({ ...row, decryptedPrivateKey });
        })
        .on('end', async () => {
            for (const walletInfo of wallets) {
                const provider = new ethers.providers.JsonRpcProvider(config.sepolia);
                const wallet = new ethers.Wallet(walletInfo.decryptedPrivateKey, provider);
                logger.info(`${wallet.address} 开始部署合约`);

                for (let i = 0; i < 5; i++) {
                    try {
                        const contractAddress = await deployContract(wallet);
                        if (contractAddress) {
                            const verifyStatus = await verifyContract(contractAddress);
                            const subMsgTx = await subMsg(wallet, generateRandomHex);
                            await saveResult(wallet.address, contractAddress, verifyStatus, subMsgTx);
                        }
                    } catch (error) {
                        logger.error(`钱包 ${walletInfo.walletId} 出现错误: ${error.message}`);
                    }
                }
            }
        });
}

main();
