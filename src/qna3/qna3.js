const ethers = require('ethers');
const crypto = require('crypto');
const fs = require('fs');
const csv = require('csv-parser');
const readlineSync = require('readline-sync');
const axios = require('axios');
const config = require('../../config/runner.json');
const fakeUa = require('fake-useragent');
const contractAddress = '0xb342e7d33b806544609370271a8d074313b7bc30';
const contractABI = require('./ABI/qna3.json');
const { HttpsProxyAgent } = require('https-proxy-agent');


const provider = new ethers.providers.JsonRpcProvider(config.opbnb);
const contractTemplate = new ethers.Contract(contractAddress, contractABI);
const agent = new HttpsProxyAgent(config.proxy);
const userAgent = fakeUa();
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

function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

function randomPause() {
    const minSeconds = Math.ceil(config.minInterval);
    const maxSeconds = Math.floor(config.maxInterval);
    return Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds;
}


async function login (wallet){
    const url = 'https://api.qna3.ai/api/v2/auth/login?via=wallet';
    const msg = 'AI + DYOR = Ultimate Answer to Unlock Web3 Universe'
    const signature = await wallet.signMessage(msg);
    console.log(`签名成功`);
    const address = wallet.address;
    

    const data = {
        'wallet_address': wallet.address,
        'signature': signature
        };
    const response = await axios.post(url, data, {headers, agent});
    headers['Authorization'] = `bearer ${response.data.data.accessToken}`;
    console.log(`登录成功,开始签到`);
    return response.data.data;
}

async function checkIn(wallet) {
    const contract = contractTemplate.connect(wallet);
    const tx = await contract.checkIn(1);
    const transactionInfo = await tx.wait();
    console.log(`签到tx: ${tx.hash}开始等待验证`);

    const url = 'https://api.qna3.ai/api/v2/my/check-in'

    const data = {
        "hash": transactionInfo.transactionHash, 
        "via": 'opbnb'
    };
    const response = await axios.post(url,data, {
        headers,
        agent 
    } );
    
    console.log(response.data);
    return response.data.statusCode;
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
                try {
                    const wallet = new ethers.Wallet(walletInfo.decryptedPrivateKey, provider);
                    console.log(`开始为 ${wallet.address}签到`);
                    await login(wallet);
                    await checkIn(wallet);
                } catch (error) {
                    console.error('操作失败:', error);
                }
            }
            if (checkIn.statusCode === 200) {
                console.log(`签到成功🏅`);
                // 暂停一段时间
                const pauseTime = randomPause();
                console.log(`任务完成，线程暂停${pauseTime}秒`);
                await sleep(pauseTime);
            } else {
                console.error(`签到失败`);
            }
        // 暂停一段时间
        
        });
}

main();

