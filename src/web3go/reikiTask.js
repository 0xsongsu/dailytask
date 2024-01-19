const ethers = require('ethers');
const crypto = require('crypto');
const fs = require('fs');
const csv = require('csv-parser');
const readlineSync = require('readline-sync');
const axios = require('axios');
const config = require('../../config/runner.json');
const fakeUa = require('fake-useragent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { sleep, randomPause} = require('../../utils/utils.js');

const agent = new HttpsProxyAgent(config.proxy);

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

async function checkIn(privateKey) {
    const wallet = new ethers.Wallet(privateKey);
    const address = wallet.address;
    const userAgent = fakeUa();

    const headers = {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9,ru-RU;q=0.8,ru;q=0.7',
        'Origin': 'https://reiki.web3go.xyz',
        'referer': 'https://reiki.web3go.xyz/taskboard',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': userAgent,
    };

    const axiosConfig = {
        headers: headers
    };

    const nonceResponse = await axios.post('https://reiki.web3go.xyz/api/account/web3/web3_nonce', {
        address: address
    }, axiosConfig, agent);
    const nonce = nonceResponse.data.nonce;

    const msg = `reiki.web3go.xyz wants you to sign in with your Ethereum account:\n${address}\n\n${nonce}\n\nURI: https://reiki.web3go.xyz\nVersion: 1\nChain ID: 56\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`;

    const signature = await wallet.signMessage(msg);

    const challengeResponse = await axios.post('https://reiki.web3go.xyz/api/account/web3/web3_challenge', {
        address: address,
        nonce: nonce,
        challenge: JSON.stringify({ msg: msg }),
        signature: signature
    }, axiosConfig, agent);
    const token = challengeResponse.data.extra.token;

    const date = new Date().toISOString().split('T')[0];
    const checkInResponse = await axios.put(`https://reiki.web3go.xyz/api/checkin?day=${date}`, {}, {
        headers: { ...axiosConfig.headers, 'Authorization': `Bearer ${token}` }
    }, agent);

    if (checkInResponse.status === 200) {
        console.log(`${address} - 签到成功🏅`);
    } else {
        console.error(`${address} - 签到失败`);
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
                console.log(`开始签到 ${walletInfo.address}`);
                await checkIn(walletInfo.decryptedPrivateKey);
                const pauseTime = randomPause();
                console.log(`暂停 ${pauseTime} 秒`);
                await sleep(pauseTime);
            }
        });
}

main();
