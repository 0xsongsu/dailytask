const ethers = require('ethers');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const csv = require('csv-parser');
const readlineSync = require('readline-sync');
const config = require('../../config/runner.json');
const contractAddress = '0xC91AAacC5adB9763CEB57488CC9ebE52C76A2b05';
const contractABI = require('./ABI/abi.json');
const { HttpsProxyAgent } = require('https-proxy-agent');
const agent = new HttpsProxyAgent(config.proxy);
const fakeUa = require('fake-useragent');
const userAgent = fakeUa();
const { sleep, randomPause, sendRequest} = require('../../utils/utils.js');


const provider = new ethers.providers.JsonRpcProvider(config.zksrpc);
const ethereumProvider = new ethers.providers.JsonRpcProvider(config.ethrpc);
const contractTemplate = new ethers.Contract(contractAddress, contractABI);

const headers = {
    'authority': 'robots.farm',
    'accept-language': 'zh-CN,zh;q=0.9',
    'referer': 'https://robots.farm/airdrop/quests',
    'sec-ch-ua': '"Google Chrome";v="117", "Not;A=Brand";v="8", "Chromium";v="117"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': userAgent,
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

async function checkGasPrice() {
    while (true) {
        console.log('开始获取当前主网GAS');
        try {
            const gasPrice = await ethereumProvider.getGasPrice();
            const formattedGasPrice = ethers.utils.formatUnits(gasPrice, 'gwei');  
            
            if (parseFloat(formattedGasPrice) <= parseFloat(config.maxGasPrice)) {
                console.log(`当前的gas为：${formattedGasPrice} Gwei，小于${config.maxGasPrice} Gwei，程序继续运行`);
                return gasPrice; 
            }

            console.log(`当前的gas为：${formattedGasPrice} Gwei，大于${config.maxGasPrice} Gwei，程序暂停5分钟`);
            await sleep(300); // 暂停5分钟
        } catch (error) {
            console.log('获取GAS价格失败，程序暂停1分钟后重新尝试');
            await sleep(60); // 暂停1分钟
        }
    }
}


async function freePlay(wallet) {
    const timeStamp = Math.floor(Date.now() / 1000);
    const msg = `Robots.farm play Quest 1 ${timeStamp}`;
    const signature = await wallet.signMessage(msg);
    const url = `https://robots.farm/api/play-quest?new_config=true&timestamp=${timeStamp}&quest=1&signature=${signature}`;
    try {
        const response = await axios.get(url, { 
            headers: headers,
            httpsAgent: agent,
        });
        return response;
    }
    catch (error) {
        throw error;
    }
}

async function main() {
    const secretKey = getKeyFromUser(); // 从用户那里获取密钥
    const wallets = [];
    await checkGasPrice();

    fs.createReadStream(config.walletPath)
    .pipe(csv())
    .on('data', (row) => {
        const decryptedPrivateKey = decrypt(row.privateKey, secretKey);
        wallets.push({ ...row, decryptedPrivateKey });
    })
        .on('end', async () => {
            console.log('所有地址已读取完毕，开始发送交易');

            for (const walletInfo of wallets) {
                try {
                    await checkGasPrice();
                    const wallet = new ethers.Wallet(walletInfo.decryptedPrivateKey, provider);
                    const contract = contractTemplate.connect(wallet);
                    const tx = await contract.getTicket();
                    console.log(`钱包地址：${wallet.address}`, `交易哈希：${tx.hash}`);
                    console.log(`开始免费游戏🎮`);
                    const playResult = await freePlay(wallet);
                    console.log(`领取成功：${playResult}`);

                    const pauseTime = randomPause();
                    console.log(`任务完成，线程暂停${pauseTime}秒`);
                    await sleep(pauseTime);
                }
                catch (error) {
                    console.error('发送交易失败:', error);
                }
            }
            console.log('所有地址的交易已经尝试发送完毕。');
        });
}

main();
