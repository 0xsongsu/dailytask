const axios = require('axios');
const fs = require('fs');
const csv = require('csv-parser');
const config = require('../../config/runner.json');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fakeUa = require('fake-useragent');
const userAgent = fakeUa();
const { sleep, randomPause, sendRequest } = require('../../utils/utils.js');
const { createTask, getTaskResult } = require('../../utils/yesCaptcha/yesCaptcha.js');

const MAX_RETRIES = 1; // 最大重试次数
const MAX_PROXY_CHECK_ATTEMPTS = 3;

const agent = new HttpsProxyAgent(config.proxy);
const websiteKey = '6Lc94akpAAAAAGaxYMKiA0qBqL10gSblHpeyD7xZ';
const websiteUrl = 'https://faucet.avail.tools/';

let headers = {
    'accept': '*/*',
    'accept-encoding': 'gzip, deflate, br',
    'accept-language': 'zh-CN,zh;q=0.6',
    'referer': 'https://faucet.avail.tools/',
    'user-agent': userAgent,
}

async function recaptcha() {
    const { taskId } = await createTask(websiteUrl, websiteKey, 'RecaptchaV3TaskProxylessM1');
    let result = await getTaskResult(taskId);
    // 如果result为空，等待6秒后再次请求
    if (!result) {
        await sleep(6);
        result = await getTaskResult(taskId);
    }
    if (!result) {
        throw new Error(`人机验证失败`);
    }
    const { gRecaptchaResponse } = result.solution;
    return gRecaptchaResponse
}

async function processAddresses(filePath) {
    const addresses = [];
    return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                addresses.push(row.polkaddress);
            })
            .on('end', () => {
                console.log('地址读取完毕');
                resolve(addresses);
            })
            .on('error', (error) => {
                console.error('读取地址失败:', error);
                reject(error);
            });
    });
}

async function main() {
    try {
        const polkAddresses = await processAddresses(config.walletPath);
        console.log('开始领取测试币');

        for (const polkAddress of polkAddresses) {
            console.log(`领取地址: ${polkAddress}`);
            const recaptchaToken = await recaptcha();
            const response = await claimTestCoins(polkAddress, recaptchaToken);
            console.log(`领取成功✅，地址：${polkAddress}，结果：${response.success}`);

        }
    }
    catch (error) {
        console.error('领取测试币失败:', error);
    }
            
            
}


async function claimTestCoins(polkAddress, recaptchaToken) {
    const url = `https://faucet.avail.tools/api/faucet/claim?address=${polkAddress}&token=${recaptchaToken}`;
    const data = { 
        address: polkAddress,
        token: recaptchaToken,
    };
    const urlConfig = {
        headers: headers,
        httpsAgent: agent,
        httpAgent: agent,
        data: data,
    };
    return await axios.get(url, urlConfig);
}

main();