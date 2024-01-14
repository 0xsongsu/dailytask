const ethers = require('ethers');
const crypto = require('crypto');
const fs = require('fs');
const csv = require('csv-parser');
const readlineSync = require('readline-sync');
const config = require('../../config/runner.json');
const contractAddress = '0xC91AAacC5adB9763CEB57488CC9ebE52C76A2b05';
const contractABI = require('./ABI/abi.json');

const provider = new ethers.providers.JsonRpcProvider(config.zksrpc);
const ethereumProvider = new ethers.providers.JsonRpcProvider(config.ethrpc);
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

function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

function randomPause() {
    const minSeconds = Math.ceil(config.minInterval);
    const maxSeconds = Math.floor(config.maxInterval);
    return Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds;
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
                    const wallet = new ethers.Wallet(walletInfo.decryptedPrivateKey, provider);
                    const contract = contractTemplate.connect(wallet);
                    const tx = await contract.getTicket();
                    console.log(`钱包地址：${wallet.address}`, `交易哈希：${tx.hash}`);

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
