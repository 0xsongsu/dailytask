const ethers = require('ethers');
const crypto = require('crypto');
const fs = require('fs');
const csv = require('csv-parser');
const { sleep, randomPause, sendRequest} = require('../../utils/utils.js');
const fakeUa = require('fake-useragent');
const readlineSync = require('readline-sync');
const config = require('../../config/runner.json');
const axios = require('axios');
const userAgent = fakeUa();
const { HttpsProxyAgent } = require('https-proxy-agent');
const agent = new HttpsProxyAgent(config.proxy);

// 这里定义了邀请码，请自行更换成自己的邀请码
const inviteCode = 'LEAP1';
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
    const url = 'https://points-api.lavanet.xyz/accounts/metamask/login/';
    const data = {
        account: wallet.address,
        invite_code: inviteCode,
        process: 'token',
    };
    const urlConfig = {
        headers: headers,
        httpsAgent: agent,
        httpAgent: agent,
        withCredentials: true
    };

    // 发起请求并接收响应
    const response = await axios.post(url, data, urlConfig);
    if (response.headers && response.headers['set-cookie']) {
        headers['cookie'] = response.headers['set-cookie'].map(cookie => {
            return cookie.split(';')[0];
        }).join('; ');
    } else {
        console.warn('响应中没有找到 set-cookie 头。');
    }

    console.log('登录成功:', response.data.data);
    return response.data.data;
}
async function stringToHex (str) {
    let hexString = '';
    for (let i = 0; i < str.length; i++) {
      const hexVal = str.charCodeAt(i).toString(16); // 将字符转换为ASCII码，再转换为十六进制
      hexString += hexVal;
    }

    return `0x${hexString}`;
}

async function signLoginData(hexString, wallet) {
    const url = 'https://points-api.lavanet.xyz/accounts/metamask/login/';
    const signature = await wallet.signMessage(hexString);
    console.log('签名成功:', signature);
    const data = {
        account: wallet.address,
        login_token: signature,
        invite_code: inviteCode,
        process: 'verify',
    };
    console.log('发送数据:', data);
    const urlConfig = {
        headers: headers,
        httpsAgent: agent,
    };
    console.log('发送数据:', urlConfig);
    const response = await axios.post(url, data, urlConfig);
    if (response.headers && response.headers['set-cookie']) {
        headers['cookie'] = response.headers['set-cookie'].map(cookie => {
            return cookie.split(';')[0]; // 获取 "key=value" 部分
        }).join('; '); // 将多个 cookie 用分号连接
        console.log('为后续请求更新了请求头中的 Cookie:', headers['cookie']);
    } else {
        console.warn('响应中没有找到 set-cookie 头。');
    }

    console.log('登录成功:', response.data);
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
    const response = await sendRequest(url, urlConfig);
    return response.data.chain
}

async function main () {
    const secretKey = getKeyFromUser();
    const wallets = [];
    fs.createReadStream(config.walletPath)
    .pipe(csv())
    .on('data', (row) => {
        const decryptedPrivateKey = decrypt(row.privateKey, secretKey);
        wallets.push({ ...row, decryptedPrivateKey });
    })
        .on('end', async () => {
            console.log('所有地址已读取完毕,开始获取RPC');
            for (const walletInfo of wallets) {
                const wallet = new ethers.Wallet(walletInfo.decryptedPrivateKey);
                console.log(`开始为 ${wallet.address}获取RPC`);
                const loginStatus = await login(wallet);
                const hexString = await stringToHex(loginStatus);
                console.log(`开始签名`, hexString);
                sleep (3000);
                const loginData = await signLoginData(hexString, wallet);
                console.log(`登陆成功，开始获取RPC`);
                const chains = await getRpc(wallet);
                
                let csvContent = 'Chain Name,Mainnet URL,Testnet URL\n';
                chains.forEach(chain => {
                    const chainName = chain.name;
                    let mainnetUrl = '';
                    let testnetUrl = '';
                    
                    // 在每个chain对象中遍历urls数组，提取Mainnet和Testnet的URL
                    chain.urls.forEach(url => {
                        if (url.name.toLowerCase().includes('mainnet')) {
                            mainnetUrl = url.value;
                        } else if (url.name.toLowerCase().includes('testnet')) {
                            testnetUrl = url.value;
                        }
                    });
                    
                    // 将提取的数据添加到csvContent字符串
                    csvContent += `${chainName},${mainnetUrl},${testnetUrl}\n`;
                });
                
                // 最后，使用fs模块将csvContent字符串写入到rpcData.csv文件中
                fs.writeFile('rpcData.csv', csvContent, 'utf8', (err) => {
                    if (err) {
                        console.log('An error occurred while writing to the file:', err);
                    } else {
                        console.log('Data has been written to rpcData.csv successfully.');
                    }
                });
                
                
            }
        }
    );
}

main();