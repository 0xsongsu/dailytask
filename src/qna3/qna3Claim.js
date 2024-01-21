const ethers = require('ethers');
const crypto = require('crypto');
const fs = require('fs');
const csv = require('csv-parser');
const fakeUa = require('fake-useragent');
const readlineSync = require('readline-sync');
const config = require('../../config/runner.json');
const contractAddress = '0xB342e7D33b806544609370271A8D074313B7bc30';
const contractABI = require('./ABI/qna3.json');
const axios = require('axios');
const userAgent = fakeUa();
const { HttpsProxyAgent } = require('https-proxy-agent');
const { sleep, randomPause, sendRequest} = require('../../utils/utils.js');
const { url } = require('inspector');

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

function formHexData(string) {
    if (typeof string !== 'string') {
        throw new Error('Input must be a string.');
    }

    if (string.length > 64) {
        throw new Error('String length exceeds 64 characters.');
    }

    return '0'.repeat(64 - string.length) + string;
}

function toBeHex(number) {
    if (typeof number !== 'number') {
        throw new Error('Input must be a number.');
    }
    return number.toString(16);
}

const contract = new ethers.Contract(contractAddress, contractABI);
const provider = new ethers.providers.JsonRpcProvider(config.bscrpc);
const agent = new HttpsProxyAgent(config.proxy);
const headers = {
    'authority': 'api.qna3.ai',
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9,ru-RU;q=0.8,ru;q=0.7',
    'content-type': 'application/json',
    'origin': 'https://qna3.ai',
    'sec-ch-ua-platform': '"Windows"',
    'user-agent': userAgent,
    'x-lang': 'english',
};

async function login (wallet){
    //const gRecaptchaResponse = await recaptcha('login');
    const url = 'https://api.qna3.ai/api/v2/auth/login?via=wallet';
    const msg = 'AI + DYOR = Ultimate Answer to Unlock Web3 Universe'
    const signature = await wallet.signMessage(msg);
    console.log(`当前地址${wallet.address}已签名`);

    const data = {
        'wallet_address': wallet.address,
        'signature': signature,
        //'recaptcha': gRecaptchaResponse,
    };
    const urlConfig = {
        headers: headers,
        httpsAgent: agent,
        httpAgent: agent,
        method: 'post',
        data: data,
    };
    const response = await sendRequest(url, urlConfig);
    headers['Authorization'] = `bearer ${response.data.accessToken}`;
    return response.data
}

async function claim (wallet) {
    let url = 'https://api.qna3.ai/api/v2/my/claim-all';
    let claimData 
    
    try {
        const data = {
            headers: headers,
            httpsAgent: agent,
            httpAgent: agent,
            method: 'post',
            data: {},
        };
    const response = await sendRequest(url, data);
    claimData = response.data;
    } catch (error) {
        console.log(error);
        return null;
    }

    const amountHex = formHexData(toBeHex(claimData.amount));
    const nonceHex = formHexData(toBeHex(claimData.signature.nonce));
    const signatureHex = claimData.signature.signature.slice(2);

    const transactionData = `0x624f82f5${amountHex}${nonceHex}00000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000041${signatureHex}00000000000000000000000000000000000000000000000000000000000000`;
    
    const gasPrice = await wallet.provider.getGasPrice();
    const nonce = await wallet.getTransactionCount();
    const txToEstimate = {
        to: contractAddress,
        data: transactionData,
    };
    const gasLimit = await wallet.estimateGas(txToEstimate);
    const txData = {
        to: contractAddress,
        data: transactionData,
        gasPrice: gasPrice,
        gasLimit: gasLimit,
        nonce: nonce,
        value: 0,
    };
 
    const tx = await wallet.sendTransaction(txData);
    console.log('领取tx：', tx.hash);

    url = `https://api.qna3.ai/api/v2/my/claim/${claimData.history_id}`;
    const data = {
        "hash": tx.hash,   
    };
    const urlConfig = {
        headers: headers,
        httpsAgent: agent,
        httpAgent: agent,
        method: 'post',
        data: data,
    };
    const response = await sendRequest(url, urlConfig);
    const responseDate = response.data;
    return responseDate;
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
                const wallet = new ethers.Wallet(walletInfo.decryptedPrivateKey, provider);
                console.log(`开始为 ${wallet.address}领取积分`);
                const loginStatus = await login(wallet);
                console.log(`登录成功，开始领取`);
                const claimRewards = await claim(wallet);
                console.log("领取成功🏅")
                // 暂停一段时间
                const pauseTime = randomPause();
                console.log(`任务完成，线程暂停${pauseTime}秒`);
                await sleep(pauseTime);
            }
        });

}

main();

