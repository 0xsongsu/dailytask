const config = require("../../config/runner.json");
const csv = require("csv-parser");
const ethers = require("ethers");
const crypto = require('crypto');
const fs = require('fs');

function getKeyFromUser() {
    let key;
    if (process.env.SCRIPT_PASSWORD) {
        key = process.env.SCRIPT_PASSWORD;
    } else {
        key = readlineSync.question('请输入你的密码: ', {
            hideEchoBack: true,
        });
    }
    return crypto.createHash('sha256').update(String(key)).digest('base64').substr(0, 32);
}

function decrypt(text, secretKey) {
    let parts = text.split(':');
    let iv = Buffer.from(parts.shift(), 'hex');
    let encryptedText = Buffer.from(parts.join(':'), 'hex');
    let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(secretKey), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

async function mint(wallet, nonce) {
    const contactAddress = wallet.address.toLowerCase().replace('0x', '');
    const transactionData = `0xc6c3bbe6000000000000000000000000${contactAddress}0000000000000000000000006581e59a1c8da66ed0d313a0d4029dce2f746cc5000000000000000000000000000000000000000000000000002386f26fc10000`;

    try {
        const gasPrice = await wallet.provider.getGasPrice();
        const txToEstimate = {
            to: "0x09ec711b81cD27A6466EC40960F2f8D85BB129D9",
            data: transactionData,
        };
        const gasLimit = await wallet.estimateGas(txToEstimate);

        const txData = {
            to: "0x09ec711b81cD27A6466EC40960F2f8D85BB129D9",
            data: transactionData,
            gasPrice: gasPrice,
            gasLimit: gasLimit,
            nonce: nonce,
            value: 0,
        };

        const tx = await wallet.sendTransaction(txData);
        console.log('mint honey：', tx.hash);

    } catch (error) {
        console.error('发送交易时出错:', error);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function randomSleep() {
    const min = 10000; // 10 seconds in milliseconds
    const max = 30000; // 30 seconds in milliseconds
    const randomTime = Math.floor(Math.random() * (max - min + 1)) + min;

    console.log(`Sleeping for ${randomTime / 1000} seconds...`);
    await sleep(randomTime);
    console.log("Awake!");
}

async function approve(wallet, nonce) {
    const transactionData = `0x095ea7b300000000000000000000000009ec711b81cd27a6466ec40960f2f8d85bb129d97fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff`
    try {
        const gasPrice = await wallet.provider.getGasPrice();
        const txToEstimate = {
            to: "0x6581e59A1C8dA66eD0D313a0d4029DcE2F746Cc5",
            data: transactionData,
        };
        const gasLimit = await wallet.estimateGas(txToEstimate);

        const txData = {
            to: "0x6581e59A1C8dA66eD0D313a0d4029DcE2F746Cc5",
            data: transactionData,
            gasPrice: gasPrice,
            gasLimit: gasLimit,
            nonce: nonce,
            value: 0,
        };

        const tx = await wallet.sendTransaction(txData);
        console.log('预授权：', tx.hash);

    } catch (error) {
        console.error('发送交易时出错:', error);
    }
}

async function main() {
    const secretKey = getKeyFromUser();
    const wallets = [];

    fs.createReadStream(config.walletPath)
        .pipe(csv())
        .on('data', (row) => {
            const decryptedPrivateKey = decrypt(row.privateKey, secretKey);
            wallets.push({ ...row, decryptedPrivateKey });
        })
        .on('end', async () => {
            for (const walletInfo of wallets) {
                const provider = new ethers.providers.JsonRpcProvider("https://rpc.ankr.com/berachain_testnet");
                const wallet = new ethers.Wallet(walletInfo.decryptedPrivateKey,provider);
                const nonce = await wallet.getTransactionCount();
                await approve(wallet, nonce);
                await randomSleep();
                mint(wallet, nonce+1);
            }
        });

}

main();