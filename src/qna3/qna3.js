const ethers = require('ethers');
const crypto = require('crypto');
const fs = require('fs');
const  { createTask, getTaskResult } = require('../../utils/yesCaptcha/yesCaptcha.js');
const csv = require('csv-parser');
const fakeUa = require('fake-useragent');
const readlineSync = require('readline-sync');
const config = require('../../config/runner.json');
const contractAddress = '0xb342e7d33b806544609370271a8d074313b7bc30';
const contractABI = require('./ABI/qna3.json');
const axios = require('axios');
const userAgent = fakeUa();
const { HttpsProxyAgent } = require('https-proxy-agent');
const { sleep, randomPause, sendRequest} = require('../../utils/utils.js');

const contractTemplate = new ethers.Contract(contractAddress, contractABI);

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

const contract = new ethers.Contract(contractAddress, contractABI);
const provider = new ethers.providers.JsonRpcProvider(config.opbnb);
const agent = new HttpsProxyAgent(config.proxy);
const websiteKey = '6Lcq80spAAAAADGCu_fvSx3EG46UubsLeaXczBat';
const websiteUrl = 'https://qna3.ai/vote';
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


async function recaptcha(pageAction) {
    const {taskId} = await createTask(websiteUrl, websiteKey, 'RecaptchaV3TaskProxyless', pageAction);
    let result = await getTaskResult(taskId);
    // 如果result为空，等待6秒后再次请求
    if (!result) {
        await sleep(0.1);
        result = await getTaskResult(taskId);
    }
    // 如果再次为空，抛出错误
    if (!result) {
        throw new Error(`${pageAction} 人机验证失败`);
    }
    const { gRecaptchaResponse } = result.solution
    return gRecaptchaResponse


}

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

async function checkIn(wallet) {
    const contractInstance = contract.connect(wallet);
    const tx = await contractInstance.checkIn(1);
    const transactionInfo = await tx.wait();
    console.log(`签到tx: ${tx.hash}开始等待验证`);

    const url = 'https://api.qna3.ai/api/v2/my/check-in';
    const data = {
        "hash": transactionInfo.transactionHash,
        "via": 'opbnb',
        };
    const urlConfig = {
        headers: headers,
        httpsAgent: agent,
        httpAgent: agent,
        method: 'post',
        data: data,
    };
    const response = await sendRequest(url, urlConfig);
    return response.data
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
                console.log(`开始为 ${wallet.address}签到`);
                //console.log(`请求google验证中......`)
                const loginStatus = await login(wallet);
                console.log(`登录成功，开始签到`);
                const checkInStatus = await checkIn(wallet);
                console.log("签到成功🏅")
                // 暂停一段时间
                const pauseTime = randomPause();
                console.log(`任务完成，线程暂停${pauseTime}秒`);
                await sleep(pauseTime);
            }
        });

}

main();

