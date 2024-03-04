const axios = require('axios');
const fs = require('fs');
const csv = require('csv-parser');
const config = require('../../config/runner.json');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fakeUa = require('fake-useragent');
const userAgent = fakeUa();
const { sleep, randomPause, sendRequest} = require('../../utils/utils.js');
const { createTask, getTaskResult } = require('../../utils/yesCaptcha/yesCaptcha.js');

const MAX_RETRIES = 5; // 最大重试次数
const MAX_PROXY_CHECK_ATTEMPTS = 3;

const agent = new HttpsProxyAgent(config.proxy);
const websiteKey = '6Ld3cEwfAAAAAMd4QTs7aO85LyKGdgj0bFsdBfre';
const websiteUrl = 'https://faucet-beta-5.fuel.network/';
headers = {
    'authority': 'faucet-beta-5.fuel.network', 
    'accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',  
    'content-type': 'application/json',
    'origin': 'https://faucet-beta-5.fuel.network', 
    'referer': 'https://faucet-beta-5.fuel.network',
    'user-agent': userAgent,
}

async function recaptcha(pageAction) {
    const {taskId} = await createTask(websiteUrl, websiteKey, 'NoCaptchaTaskProxyless', pageAction);
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
                addresses.push(row.fuelAddress);
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
        let proxyVerified = false; // 代理验证标志
        let proxyAttempts = 0; // 代理检查尝试次数

        while (!proxyVerified && proxyAttempts < MAX_PROXY_CHECK_ATTEMPTS) {
            console.log('测试代理IP是否正常');
            try {
                const response = await sendRequest('https://myip.ipip.net', {
                    method: 'get', 
                    httpAgent: agent, 
                    httpsAgent: agent
                });
                console.log('验证成功, IP信息: ', response);
                proxyVerified = true; // 代理验证成功
            } catch (error) {
                proxyAttempts++;
                console.log('代理失效，等待1分钟后重新验证');
                await sleep(60); // 等待1分钟
            }
        }

        if (!proxyVerified) {
            console.log('代理验证失败，无法继续执行任务');
            return; // 如果代理验证失败，结束函数
        }
    } catch (error) {
        console.error('发生错误:', error);
    }

    const fuelAddresses = await processAddresses(config.walletPath);
    console.log('开始领取测试币');

    for (const fuelAddress of fuelAddresses) {
        console.log(`领取地址: ${fuelAddress}`);
        let attempts = 0;
        let success = false;
        while (attempts < MAX_RETRIES && !success) {
            try {
                const recaptchaToken = await recaptcha('giveMeEther');
                const response = await claimTestCoins(fuelAddress, recaptchaToken); 
                if (response && response.status === 'Success') {
                    console.log(`领取成功✅，地址：${fuelAddress}，领取数量：${response.tokens}`);
                    success = true;
                } else {
                    throw new Error(`服务器返回失败状态: ${response.data.status}`);
                }
            } catch (error) {
                console.error(`领取失败❌，地址：${fuelAddress}，错误：${error.message}, 开始重试第 ${attempts + 1} 次`);
                await sleep(5); 
            }
            attempts++;
        }
    }
}

async function claimTestCoins(fuelAddress, recaptchaToken) {
    const url = `https://faucet-beta-5.fuel.network/dispense`;
    const data = { 
        address: fuelAddress,
        captcha: recaptchaToken,
    };
    const urlConfig = {
        headers: headers,
        httpsAgent: agent,
        httpAgent: agent,
        method: 'post',
        data: data,
    };
    return await sendRequest(url, urlConfig);
}

main();