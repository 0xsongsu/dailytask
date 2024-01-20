const ethers = require('ethers');
const crypto = require('crypto');
const fs = require('fs');
const csv = require('csv-parser');
const fakeUa = require('fake-useragent');
const readlineSync = require('readline-sync');
const config = require('../../config/runner.json');
const contractAddress = '0xb342e7d33b806544609370271a8d074313b7bc30';
const contractABI = require('./ABI/qna3.json');
const axios = require('axios');
const userAgent = fakeUa();
const { HttpsProxyAgent } = require('https-proxy-agent');
const { sleep, randomPause, sendRequest} = require('../../utils/utils.js');
const { url } = require('inspector');

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

const contract = new ethers.Contract(contractAddress, contractABI);
const provider = new ethers.providers.JsonRpcProvider(config.opbnb);
const agent = new HttpsProxyAgent(config.proxy);
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

async function claim () {
    let url = 'https://api.qna3.ai/api/v2/my/claim-all';
    let claimData 
    
    try {
        const data = {
            headers: headers,
            httpsAgent: agent,
            httpAgent: agent,
            method: 'post',
            data: {},
        };
    const response = await sendRequest(url, data);
    claimData = response.data;
    } catch (error) {
        console.log(error);
        return null;
    }

    const amountHex = claimData.amount;
}