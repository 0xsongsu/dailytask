const ethers = require('ethers');
const crypto = require('crypto');
const fs = require('fs');
const csv = require('csv-parser');
const readlineSync = require('readline-sync');
const config = require('../../config/runner.json');
const contractAddress = '0xa4Aff9170C34c0e38Fed74409F5742617d9E80dc';
const contractABI = require('./ABI/reiki.json');
const { sleep, randomPause} = require('../../utils/utils.js');

const provider = new ethers.providers.JsonRpcProvider(config.bscrpc);
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

async function main() {
    const secretKey = getKeyFromUser(); // 从用户那里获取密钥
    const wallets = [];

    fs.createReadStream(config.walletPath)
    .pipe(csv())
    .on('data', (row) => {
        const decryptedPrivateKey = decrypt(row.privateKey, secretKey);
        wallets.push({ ...row, decryptedPrivateKey });
    })
        .on('end', async () => {
            console.log('所有地址已读取完毕，开始MINT');

            for (const walletInfo of wallets) {
                try {
                    const wallet = new ethers.Wallet(walletInfo.decryptedPrivateKey, provider);
                    const contract = contractTemplate.connect(wallet);
                    const gasPrice = await provider.getGasPrice();
                    const gasLimit = await contract.estimateGas.safeMint(wallet.address);

                    const tx = await contract.safeMint(wallet.address, {
                        gasLimit: gasLimit,
                        gasPrice: gasPrice,
                    });

                    console.log(`钱包地址：${wallet.address}`, `MINT哈希：${tx.hash}`);

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