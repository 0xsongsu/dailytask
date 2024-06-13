const ethers = require('ethers');
const crypto = require('crypto');
const { Web3 } = require('web3');
const fs = require('fs');
const csvParser = require('csv-parser');
const readlineSync = require('readline-sync');
const axios = require('axios');
const fakeUa = require('fake-useragent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const config = require('../../config/runner.json');

const inviteCode = 'SIRNB';
const provider = new Web3.providers.HttpProvider(config.ethrpc);
const web3 = new Web3(provider);
const agent = new HttpsProxyAgent(config.proxy);

const headers = {
    'authority': 'points-api.lavanet.xyz',
    'accept': 'application/json',
    'content-type': 'application/json',
    'origin': 'https://points.lavanet.xyz',
    'referer': 'https://points.lavanet.xyz/',
    'sec-ch-ua-platform': '"Windows"',
    'user-agent': fakeUa(),
    'x-lang': 'english',
};

class Twitter {
    constructor(auth_token) {
        this.auth_token = auth_token;
        const bearer_token = "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
        this.baseUrl = 'https://api.twitter.com';
        this.headers = {
            'authority': 'twitter.com',
            'origin': 'https://twitter.com',
            'x-twitter-active-user': 'yes',
            'x-twitter-client-language': 'en',
            'authorization': bearer_token,
        };
        this.cookies = { 'auth_token': auth_token };
        this.twitter = axios.create({
            baseURL: this.baseUrl,
            headers: this.headers,
            timeout: 120000,
            withCredentials: true
        });
        this.authenticity_token = null;
        this.oauth_verifier = null;
    }

    async getTwitterToken(oauth_token) {
        try {
            const params = {
                'oauth_token': oauth_token,
                'oauth_callback': 'https://points-api.lavanet.xyz/accounts/twitter/login/callback/'
            };
            const response = await this.twitter.get('/oauth/authorize', { params: params });
            if (response.data.includes('authenticity_token')) {
                this.authenticity_token = response.data.split('authenticity_token" value="')[1].split('"')[0];
                return true;
            }
            console.error('获取 authenticity_token 失败');
            return false;
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    async twitterAuthorize(oauth_token) {
        try {
            if (!await this.getTwitterToken(oauth_token)) {
                return false;
            }
            const data = {
                'authenticity_token': this.authenticity_token,
                'redirect_after_login': `https://api.twitter.com/oauth/authorize?oauth_token=${oauth_token}`,
                'oauth_token': oauth_token
            };
            const response = await this.twitter.post('/oauth/authorize', data);
            if (response.data.includes('oauth_verifier')) {
                this.oauth_verifier = response.data.split('oauth_verifier=')[1].split('"')[0];
                return true;
            }
            return false;
        } catch (e) {
            console.error(e);
            return false;
        }
    }
}

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
        // withCredentials: true
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

async function signLoginData(hexString, wallet) {
    const signature = await web3.eth.accounts.sign(hexString, wallet.privateKey);
    const address = wallet.address.toLowerCase();

    const urlConfig = {
        headers: headers,
        httpsAgent: agent,
    };

    const baseData = {
        account: address,
        invite_code: inviteCode,
        process: 'token'
    };
    const resp = await axios.post(url, baseData, urlConfig);
    const login_token = resp.data;
    console.log(login_token);
    
    const data = {
        account: address,
        base_login_token: login_token,
        login_token: signature,
        invite_code: inviteCode,
        process: 'verify',
    };
    
    const response = await axios.post('https://points-api.lavanet.xyz/accounts/metamask4/login/', data, urlConfig);
    const cookies = response.headers['set-cookie'];
    let cookieString = cookies.map(cookie => cookie.replace('Secure,', '')).join('; ');
    headers['cookie'] = cookieString;
    return response.data;
}

async function bindtw(wallet, authToken) {
    const url = 'https://points-api.lavanet.xyz/accounts/twitter/login/';
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
    };

    try {
        const response = await axios.get(url, urlConfig);
        const location = response.headers['location'];
        const oauth_token = location.split('oauth_token=')[1].split('&')[0];
        const twitter = new Twitter(authToken);

        if (await twitter.twitterAuthorize(oauth_token)) {
            const callbackParams = {
                'oauth_token': oauth_token,
                'oauth_verifier': twitter.oauth_verifier
            };
            const callbackResponse = await axios.get('https://points-api.lavanet.xyz/accounts/twitter/login/callback/', {
                params: callbackParams,
                maxRedirects: 0
            });
            if (callbackResponse.status === 302 && callbackResponse.headers['location'] === '/api/v4/ok') {
                console.log(`Twitter 绑定成功: ${wallet.address}`);
                return response.data;
            } else {
                console.error(`Twitter 绑定回调失败: ${wallet.address}`);
                return null;
            }
        } else {
            console.log(`Twitter 授权失败: ${wallet.address}`);
            return null;
        }
    } catch (error) {
        console.error(`绑定 Twitter 时出错: ${wallet.address}`, error);
        return null;
    }
}

async function main() {
    const secretKey = getKeyFromUser();
    const wallets = [];
    const tokens = fs.readFileSync('twtoken.txt', 'utf8').split('\n').filter(Boolean); // 读取 Twitter token 文件
    let tokenIndex = 0;

    fs.createReadStream(config.walletPath)
        .pipe(csvParser())
        .on('data', (row) => {
            const decryptedPrivateKey = decrypt(row.privateKey, secretKey);
            wallets.push({ ...row, decryptedPrivateKey });
        })
        .on('end', async () => {
            console.log('所有地址已读取完毕，开始绑定 Twitter');
            for (const walletInfo of wallets) {
                const wallet = new ethers.Wallet(walletInfo.decryptedPrivateKey);
                console.log(`开始为 ${wallet.address} 绑定`);
                const loginStatus = await login(wallet);
                const hexString = await stringToHex(loginStatus);
                const loginData = await signLoginData(hexString, wallet);

                // 绑定 Twitter
                if (tokenIndex < tokens.length) {
                    const authToken = tokens[tokenIndex];
                    const bindtwData = await bindtw(wallet, authToken);
                    console.log(bindtwData);
                    tokenIndex++;
                } else {
                    console.log('没有足够的 Twitter 令牌');
                    break;
                }
            }
        });
}

main();
