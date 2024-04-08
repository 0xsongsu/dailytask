const axios = require('axios');
const fs = require('fs');
const csv = require('csv-parser');
const config = require('../../config/runner.json');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fakeUa = require('fake-useragent');
const userAgent = fakeUa();
const { sleep, randomPause, sendRequest } = require('../../utils/utils.js');
const { createTask, getTaskResult } = require('../../utils/yesCaptcha/yesCaptcha.js');
const ethers = require('ethers');

const MAX_RETRIES = 5; // 最大重试次数
const MAX_PROXY_CHECK_ATTEMPTS = 3;

const agent = new HttpsProxyAgent(config.proxy);
const websiteKey = '0x4AAAAAAARdAuciFArKhVwt';
const websiteUrl = 'https://artio.faucet.berachain.com/';
let headers = {
    'authority': 'artio-80085-faucet-api-cf.berachain.com',
    'accept': '*/*',
    'accept-language': 'zh-CN,zh;q=0.9',
    'cache-control': 'no-cache',
    'content-type': 'text/plain;charset=UTF-8',
    'origin': 'https://artio.faucet.berachain.com/',
    'pragma': 'no-cache',
    'referer': 'https://artio.faucet.berachain.com/',
    'user-agent': userAgent,
}

async function recaptcha() {
    const { taskId } = await createTask(websiteUrl, websiteKey, 'TurnstileTaskProxylessM1');
    let result = await getTaskResult(taskId);
    // 如果result为空，等待6秒后再次请求
    if (!result) {
        await sleep(6);
        result = await getTaskResult(taskId);
    }
    // 如果再次为空，抛出错误
    if (!result) {
        throw new Error(`人机验证失败`);
    }
    const { token } = result.solution;
    return token;
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

async function main() {
    try {
        const addresses = await processAddresses(config.walletPath);
        console.log('开始领取测试币');

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

        for (const address of addresses) {
            let checksumAddress;
            try {
                checksumAddress = ethers.utils.getAddress(address);
            } catch (error) {
                console.error(`地址格式错误: ${address}`, error);
                continue; // 跳过无效地址
            }
            console.log(`领取地址: ${checksumAddress}`);

            let attempts = 0;
            while (attempts < MAX_RETRIES) {
                try {

                    const recaptchaToken = await recaptcha();
                    headers['authorization'] = `Bearer ${recaptchaToken}`;
                    const url = `https://artio-80085-faucet-api-cf.berachain.com/api/claim?address=${checksumAddress}`;
                    const data = { address: checksumAddress };
                    const urlConfig = {
                        headers: headers,
                        httpsAgent: agent,
                        httpAgent: agent,
                        method: 'post',
                        data: data,
                    };

                    const response = await sendRequest(url, urlConfig);
                    const txHash = response.msg;
                    console.log('领取成功✅ ', txHash);
                    break; // 成功后退出循环
                } catch (error) {
                    attempts++;
                    if (error.response && error.response.data && error.response.data.message === 'Faucet is overloading, please try again') {
                        console.log(`地址${checksumAddress}正在重试第 ${attempts} 次...`);
                        await sleep(5);
                    } else {
                        console.error(`领取失败❌，地址：${checksumAddress}:`, error);
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
