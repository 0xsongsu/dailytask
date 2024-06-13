const ethers = require('ethers');
const crypto = require('crypto');
const { Web3 } = require('web3');
const fs = require('fs');
const csvParser = require('csv-parser');
const { sleep, sendRequest } = require('../../utils/utils.js');
const fakeUa = require('fake-useragent');
const readlineSync = require('readline-sync');
const config = require('../../config/runner.json');
const axios = require('axios');
const userAgent = fakeUa();
const { HttpsProxyAgent } = require('https-proxy-agent');
const agent = new HttpsProxyAgent(config.proxy);
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// 这里定义了邀请码，请自行更换成自己的邀请码
const inviteCode = 'SIRNB';
const provider = new Web3.providers.HttpProvider(config.ethrpc);
const web3 = new Web3(provider);

const headers = {
    'authority': 'points-api.lavanet.xyz',
    'accept': 'application/json',
    'content-type': 'application/json',
    'origin': 'https://points.lavanet.xyz',
    'referer': 'https://points.lavanet.xyz/',
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

async function login(wallet) {
    const url = 'https://points-api.lavanet.xyz/accounts/metamask4/login/';
    const address = wallet.address.toLowerCase();
    const data = {
        account: address,
        invite_code: inviteCode,
        process: 'token',
    };
    const urlConfig = {
        headers: headers,
        httpsAgent: agent,
        httpAgent: agent,
        withCredentials: true
    };

    const response = await axios.post(url, data, urlConfig);
    return response.data.data;
}

async function stringToHex(str) {
    let hexString = '';
    for (let i = 0; i < str.length; i++) {
        const hexVal = str.charCodeAt(i).toString(16);
        hexString += hexVal;
    }
    return `0x${hexString}`;
}

async function signLoginData(baseData, hexString, wallet) {
    const url = 'https://points-api.lavanet.xyz/accounts/metamask4/login/';
    const signature = await web3.eth.accounts.sign(hexString, wallet.privateKey);
    const address = wallet.address.toLowerCase();
    console.log('base', baseData);
    const data = {
        account: address,
        base_login_token: baseData,
        login_token: signature.signature,
        invite_code: inviteCode,
        process: 'verify',
    };

    const urlConfig = {
        headers: headers,
        httpsAgent: agent,
    };
    const response = await axios.post(url, data, urlConfig);
    const cookies = response.headers['set-cookie'];
    if (cookies && cookies.length > 0) {
        let cookieString = cookies.map(cookie => cookie.split(';')[0]).join('; ');
        headers['cookie'] = cookieString;
    }
    return response.data;
}

async function getRpc(wallet) {
    const url = 'https://points-api.lavanet.xyz/api/v1/users/me';
    const urlConfig = {
        headers: headers,
        httpsAgent: agent,
        httpAgent: agent,
        method: 'get',
    };

    while (true) {
        try {
            const response = await sendRequest(url, urlConfig);
            const userHash = response.user_hash;

            // 拼接链接并保存到数组中
            const ethUrl = `https://eth1.lava.build/lava-referer-${userHash}/`;
            const nearUrl = `https://near.lava.build/lava-referer-${userHash}/`;
            const starkUrl = `https://rpc.starknet.lava.build/lava-referer-${userHash}/`;
            const axelarUrl = `https://tm.axelar.lava.build/lava-referer-${userHash}/`;

            return [ethUrl, nearUrl, starkUrl, axelarUrl];
        } catch (error) {
            if (error.response && error.response.status === 502) {
                console.error(`请求失败: 服务器错误 ${error.response.status}`);
                console.error(`正在尝试重新发送请求...`);
            } else {
                // 如果不是502错误，则抛出原始错误
                throw error;
            }
        }
        // 等待5秒后重试
        await sleep(5);
    }
}

async function saveToCsv(filePath, data) {
    // 动态确定链名称作为列标题
    const allChains = new Set();
    Object.values(data).forEach(chains => Object.keys(chains).forEach(chain => allChains.add(chain)));
    const headers = [{ id: 'Address', title: 'Address' }, ...Array.from(allChains).map(chain => ({ id: chain, title: chain }))]; // 构建列标题，包含Address

    // 构建CSV记录
    const records = Object.entries(data).map(([address, chains]) => {
        const record = { Address: address };
        allChains.forEach(chain => {
            record[chain] = chains[chain] || ''; // 如果某链没有URL，则留空
        });
        return record;
    });

    // 创建和写入CSV文件
    const csvWriter = createCsvWriter({
        path: filePath,
        header: headers,
    });

    await csvWriter.writeRecords(records);
    console.log('RPC数据已保存到文件');
}

async function main() {
    const secretKey = getKeyFromUser();
    const wallets = [];
    const csvPath = 'rpcData.csv'; // CSV文件路径
    let data = {};
    try {
        const csvData = fs.readFileSync(csvPath, 'utf8');
    } catch (error) {
        console.log('未找到现有 rpcData 文件，将创建新文件');
    }

    fs.createReadStream(config.walletPath)
        .pipe(csvParser())
        .on('data', (row) => {
            const decryptedPrivateKey = decrypt(row.privateKey, secretKey);
            wallets.push({ ...row, decryptedPrivateKey });
        })
        .on('end', async () => {
            console.log('所有地址已读取完毕，开始获取 RPC');
            for (const walletInfo of wallets) {
                const wallet = new ethers.Wallet(walletInfo.decryptedPrivateKey);
                console.log(`开始为 ${wallet.address} 获取 RPC`);
                const loginStatus = await login(wallet);
                if (!loginStatus) continue;
                const hexString = await stringToHex(loginStatus);
                const loginData = await signLoginData(loginStatus, hexString, wallet);
                const rpcUrls = await getRpc(wallet);

                // 将四个链接保存到数据对象中
                data[wallet.address] = {
                    ETH: rpcUrls[0],
                    NEAR: rpcUrls[1],
                    STARK: rpcUrls[2],
                    AXELAR: rpcUrls[3]
                };

                // 将数据保存到 CSV 文件
                await saveToCsv(csvPath, data);
            }
            console.log('所有地址的 RPC 信息已获取完毕并保存');
        });
}

main();
