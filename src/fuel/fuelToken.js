const axios = require('axios');
const fs = require('fs');
const csv = require('csv-parser');
const readline = require('readline'); 
const config = require('../../config/runner.json');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fakeUa = require('fake-useragent');
const userAgent = fakeUa();
const { sleep, randomPause, sendRequest, logger} = require('../../utils/utils.js');
const { createTask, getTaskResult } = require('../../utils/capsolver/capsolver.js');
const pLimit = require('p-limit');

const MAX_RETRIES = 5; // 最大重试次数
const MAX_PROXY_CHECK_ATTEMPTS = 3;
const CONCURRENCY_LIMIT = 20; // 并发限制

const agent = new HttpsProxyAgent(config.proxy);
const websiteKey = '6Ld3cEwfAAAAAMd4QTs7aO85LyKGdgj0bFsdBfre';
const websiteUrl = 'https://faucet-testnet.fuel.network/dispense';
headers = {
    'authority': 'faucet-beta-5.fuel.network', 
    'accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',  
    'content-type': 'application/json',
    'origin': 'https://faucet-testnet.fuel.network', 
    'referer': 'https://faucet-testnet.fuel.network/',
    'user-agent': userAgent,
}

async function recaptcha( ) {
    const {taskId} = await createTask(websiteUrl, websiteKey, 'RecaptchaV2EnterpriseTaskProxyless');
    let result = await getTaskResult(taskId);
    if (!result) {
        await sleep(0.1);
        result = await getTaskResult(taskId);
    }

    if (!result) {
        throw new Error(`${pageAction} 人机验证失败`);
    }
    const { gRecaptchaResponse } = result.solution;
    return gRecaptchaResponse
}

async function processAddresses() {
    const addresses = [];
    const fileStream = fs.createReadStream('addr.txt');
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        addresses.push(line.trim());
    }

    return addresses;
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
                proxyVerified = true;
            } catch (error) {
                proxyAttempts++;
                console.log('代理失效，等待1分钟后重新验证');
                await sleep(60);
            }
        }

        if (!proxyVerified) {
            console.log('代理验证失败，无法继续执行任务');
            return; 
        }
    } catch (error) {
        console.error('发生错误:', error);
    }

    const fuelAddresses = await processAddresses();
    console.log('开始领取测试币');

    const limit = pLimit(CONCURRENCY_LIMIT);

    const tasks = fuelAddresses.map(fuelAddress => 
        limit(async () => {
            console.log(`领取地址: ${fuelAddress}`);
            let attempts = 0;
            let success = false;
            while (attempts < MAX_RETRIES && !success) {
                try {
                    const recaptchaToken = await recaptcha();
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
        })
    );

    await Promise.all(tasks);
    console.log('所有任务已完成');
}

async function claimTestCoins(fuelAddress, recaptchaToken) {
    const url = `https://faucet-testnet.fuel.network/dispense`;
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
