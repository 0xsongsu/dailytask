const axios = require('axios');
const fs = require('fs');
const csv = require('csv-parser');
const config = require('../../config/runner.json');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fakeUa = require('fake-useragent');
const userAgent = fakeUa();
const { sleep, randomPause, sendRequest} = require('../../utils/utils.js');
const { createTask, getTaskResult } = require('../../utils/yesCaptcha/yesCaptcha.js');
const { url } = require('inspector');
const { STATUS_CODES } = require('http');

const MAX_RETRIES = 5; // 最大重试次数

const agent = new HttpsProxyAgent(config.proxy);
const websiteKey = '6LfOA04pAAAAAL9ttkwIz40hC63_7IsaU2MgcwVH';
const websiteUrl = 'https://artio.faucet.berachain.com';
headers = {
    'authority': 'artio-80085-faucet-api-recaptcha.berachain.com', 
    'accept': '*/*',
    'accept-language': 'zh-CN,zh;q=0.9', 
    'cache-control': 'no-cache', 
    'content-type': 'text/plain;charset=UTF-8',
    'origin': 'https://artio.faucet.berachain.com', 
    'pragma': 'no-cache',
    'referer': 'https://artio.faucet.berachain.com/',
    'user-agent': userAgent,
}

async function recaptcha(pageAction) {
    const {taskId} = await createTask(websiteUrl, websiteKey, 'RecaptchaV3TaskProxylessM1', pageAction);
    let result = await getTaskResult(taskId);
    // 如果result为空，等待6秒后再次请求
    if (!result) {
        await sleep(0.1);
        result = await getTaskResult(taskId);
    }
    // 如果再次为空，抛出错误
    if (!result) {
        throw new Error(`${pageAction} 人机验证失败`);
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
                addresses.push(row.address);
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

async function main(wallet) {
    try {
        const addresses = await processAddresses(config.walletPath);
        console.log('开始领取测试币');

        for (const address of addresses) {
            console.log(`领取地址: ${address}`);

            let attempts = 0;
            while (attempts < MAX_RETRIES) {
                try {
                    const recaptchaToken = await recaptcha('driptoken');
                    headers['authorization'] = `Bearer ${recaptchaToken}`;
                    const url = `https://artio-80085-ts-faucet-api-2.berachain.com/api/claim?address=${address}`;
                    const data = { address: address };
                    const urlConfig = {
                        headers: headers,
                        httpsAgent: agent,
                        httpAgent: agent,
                        method: 'post',
                        data: data,
                    };

                    const response = await sendRequest(url, urlConfig);
                    if (response.status === 200) {
                        console.log(`地址${address}领取成功`);
                        break; // 成功则退出循环
                    } else {
                        console.log(`地址${address}领取失败，状态码：${response.status}`);
                        break; // 如果不是重试的错误，退出循环
                    }
                } catch (error) {
                    if (error.response && error.response.data.message === 'Faucet is overloading, please try again') {
                        attempts++;
                        console.log(`地址${address}正在重试第 ${attempts} 次...`);
                        await sleep(5);
                    } else {
                        console.error(`领取失败❌，地址：${address}:`, error);
                        break; // 如果是非重试的错误，退出循环
                    }
                }
            }
        }
    } catch (error) {
        console.error('处理地址列表时出错:', error);
    }
}

main();