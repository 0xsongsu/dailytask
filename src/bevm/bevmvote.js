const ethers = require('ethers');
const crypto = require('crypto');
const fs = require('fs');
const csv = require('csv-parser');
const readlineSync = require('readline-sync');
const config = require('../../config/runner.json');
const voteConfig = require('./voteticket.json');
const { sleep, randomPause } = require('../../utils/utils.js');


const hexValue = voteConfig.coralfinance;
// 要给哪个项目投票，就在这里修改对应的项目的名字，目前支持的项目有：
//     "SatoshiProtocol"
//     "coralfinance"
//     "bidofinance"
//     "omniBTC"
//     "intract"
//     "particleNetwork"
//     "owltoFinance"
//     "orbitFinance"
//     "bitSmiley"
//     "mesonFinance"


const contractAddress = '0x3aaF53A884266Ea0c382FE320438f06f2AFC3804';
const contractABI = [
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "voter",
                "type": "uint256"
            }
        ],
        "name": "vote",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

const provider = new ethers.providers.JsonRpcProvider("https://rpc-mainnet-1.bevm.io");
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
            console.log('所有地址已读取完毕，开始投票');

            for (const walletInfo of wallets) {
                try {
                    const wallet = new ethers.Wallet(walletInfo.decryptedPrivateKey, provider);
                    const voterId = ethers.BigNumber.from(hexValue);
                    const contract = contractTemplate.connect(wallet);
                    const gasPrice = await provider.getGasPrice();
                    const gasLimit = await contract.estimateGas.vote(voterId);

                    const tx = await contract.vote(voterId, {
                        gasLimit: gasLimit,
                        gasPrice: gasPrice,
                    });

                    console.log(`钱包地址：${wallet.address}`, `投票哈希：${tx.hash}`);

                    const pauseTime = randomPause();
                    console.log(`任务完成，线程暂停${pauseTime}秒`);
                    await sleep(pauseTime);
                } catch (error) {
                    console.error('投票失败:', error);
                }
            }
            console.log('所有地址投票完毕。');
        });
}

main().catch(console.error);
