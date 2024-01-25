const crypto = require('crypto');
const fs = require('fs');
const csv = require('csv-parser');
const readlineSync = require('readline-sync');
const axios = require('axios');
const config = require('../../config/runner.json');
const fakeUa = require('fake-useragent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const ethers = require('ethers');
const { url } = require('inspector');
const { sleep, randomPause} = require('../../utils/utils.js');

const agent = new HttpsProxyAgent(config.proxy);
const userAgent = fakeUa();
let headers = {
    'authority': 'interface.carv.io',
    'Accept': 'application/json, text/plain, */*',
    'Content-type': 'application/json',
    'Origin': 'https://protocol.carv.io',
    'Referer': 'https://protocol.carv.io/',
    'User-Agen': userAgent,
    'X-App-Id': 'carv',
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

function formHexData(string) {
    if (typeof string !== 'string') {
        throw new Error('Input must be a string.');
    }

    if (string.length > 64) {
        throw new Error('String length exceeds 64 characters.');
    }

    return '0'.repeat(64 - string.length) + string;
}

async function login(wallet) {
    const address = wallet.address;
    const url = 'https://interface.carv.io/protocol/login';
    const msg = `Hello! Please sign this message to confirm your ownership of the address. This action will not cost any gas fee. Here is a unique text: ${Date.now()}`;
    const signature = await wallet.signMessage(msg);
    const data = {
        wallet_addr: address,
        text: msg,
        signature: signature,
    };

    try {
        const response = await axios.post(url, data, { 
            headers: headers, 
            httpsAgent: agent,
            httpAgent: agent,
        });
        const token = response.data.data.token;
        const bearer = "bearer " + Buffer.from(`eoa:${token}`).toString('base64');
        headers = {
            ...headers,
            'Authorization': bearer,
            'Content-Type': 'application/json',
        };
        return bearer;
    }
    catch (error) {
        console.error('登录过程中发生错误:', error.message);
        return null;
    }
}

// roin签到
async function roinCheckIn() {
    const url = 'https://interface.carv.io/airdrop/mint/carv_soul';
    const data = {
        'chain_id': 2020,
    };

    try {
        const response = await axios.post(url, data, { 
            headers: headers, 
            httpsAgent: agent,
            httpAgent: agent, 
        });
    }
    catch (error) {
        console.error('Roin签到过程中发生错误:', error.message);
    }
}

async function checkIndata() {
    const url = 'https://interface.carv.io/airdrop/mint/carv_soul';
    const data = {
        'chain_id': 204,
    };

    try {
        const response = await axios.post(url, data, { 
            headers: headers, 
            //httpsAgent: agent,
            //httpAgent: agent, 
        });
        const signature = response.data.data.signature;
        const contract = response.data.data.contract;
        const account = response.data.data.permit.account;
        const amount = response.data.data.permit.amount;
        const ymd = response.data.data.permit.ymd;
        const checkIndata = {
            permit: {
                account: account,
                amount: amount,
                ymd: ymd,
            },
            signature: signature,
            contract: contract,
        };
        return checkIndata;
        }
    catch (error) {
    console.error('获取信息失败:', error.message);
        }
}

async function checkIn (wallet, checkIndata) {
    const signature = checkIndata.signature;
    const contract = checkIndata.contract;
    const account = checkIndata.permit.account;
    const amount = checkIndata.permit.amount;
    const ymd = checkIndata.permit.ymd;
    
    const addressData = formHexData(account.substring(2));
    const amountData = formHexData(amount.toString(16));
    const ymdData = formHexData(ymd.toString(16));
    const contractAddress = contract;
    const transactionData = `0xa2a9539c${addressData}${amountData}${ymdData}00000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000041${signature.substring(2)}00000000000000000000000000000000000000000000000000000000000000`;
    // 发送交易
    try {
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
        console.log('签到tx：', tx.hash);

    } catch (error) {
        console.error('发送交易时出错:', error);
    }
}


function main () {
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
                    const provider = new ethers.providers.JsonRpcProvider(config.opbnb);
                    const wallet = new ethers.Wallet(walletInfo.decryptedPrivateKey,provider);
                    console.log(`开始为 ${wallet.address}签到`);
                    const bearer = await login(wallet);
                    const roinCheck = await roinCheckIn(bearer);
                    const checkData = await checkIndata();
                    const checkInopBnb = await checkIn(wallet, checkData);
                    console.log(`签到成功🏅`);
                    // 暂停一段时间
                    const pauseTime = randomPause();
                    console.log(`任务完成，线程暂停${pauseTime}秒`);
                    await sleep(pauseTime);
                } catch (error) {
                    console.error('Error with wallet:', walletInfo.walletId, error.message);
                }
            }
        });
}

main();