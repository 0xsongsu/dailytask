const axios = require('axios');
const fs = require('fs');
const config = require('../../config/runner.json');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fakeUa = require('fake-useragent');
const userAgent = fakeUa();
const { sleep, randomPause, sendRequest, logger } = require('../../utils/utils.js');
const { createTask, getTaskResult } = require('../../utils/capsolver/capsolver.js');
// 如果用capsolver就注释下面一行，用yes就注释上面一行
// const { createTask, getTaskResult } = require('../../utils/yesCaptcha/yesCaptcha.js');
const ethers = require('ethers');

const MAX_RETRIES = 5; // 最大重试次数
const MAX_PROXY_CHECK_ATTEMPTS = 3;
const CONCURRENT_REQUESTS = 1; // 并发请求数量

const agent = new HttpsProxyAgent(config.proxy);
const websiteKey = '0x4AAAAAAARdAuciFArKhVwt';
const websiteUrl = 'https://bartio.faucet.berachain.com/';
let headers = {
    'authority': 'artio-80085-faucet-api-cf.berachain.com',
    'accept': '*/*',
    'accept-language': 'zh-CN,zh;q=0.9',
    'cache-control': 'no-cache',
    'content-type': 'text/plain;charset=UTF-8',
    'origin': 'https://bartio.faucet.berachain.com',
    'pragma': 'no-cache',
    'referer': 'https://bartio.faucet.berachain.com/',
    'user-agent': userAgent,
};

async function recaptcha() {
    const { taskId } = await createTask(websiteUrl, websiteKey, 'AntiTurnstileTaskProxyLess'); //如果你用yes，把这里改成“TurnstileTaskProxylessM1”
    let result = await getTaskResult(taskId);
    if (!result) {
        await sleep(6);
        result = await getTaskResult(taskId);
    }
    if (!result) {
        throw new Error(`人机验证失败`);
    }
    const { token } = result.solution;
    return token;
}

async function processAddresses(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        const addresses = data.split('\n').filter(line => line.trim() !== '');
        logger().info('地址读取完毕');
        return addresses;
    } catch (error) {
        logger().error('读取地址失败:', error);
        throw error;
    }
}

async function claimToken(address) {
    logger().info(`开始为 ${address} 地址领取测试币`);
    let attempts = 0;
    while (attempts < MAX_RETRIES) {
        try {
            const recaptchaToken = await recaptcha();
            headers['authorization'] = `Bearer ${recaptchaToken}`;
            const url = `https://bartio-faucet.berachain-devnet.com/api/claim?address=${address}`;
            const data = { address };
            const urlConfig = {
                headers: headers,
                httpsAgent: agent,
                httpAgent: agent,
                method: 'post',
                data: data,
            };

            const response = await sendRequest(url, urlConfig);
            const txHash = response.msg;
            logger().info(`领取成功✅，交易哈希: ${txHash}`);
            return;
        } catch (error) {
            attempts++;
            if (error.response && error.response.data && error.response.data.message === 'Faucet is overloading, please try again') {
                logger().warn(`地址${address}正在重试第 ${attempts} 次...`);
                await sleep(5);
            } else {
                logger().error(`领取失败❌，地址：${address}:`, error);
                break;
            }
        }
    }
}

async function main() {
    try {
        const addresses = await processAddresses('./address.txt');
        logger().info('开始领取测试币');

        let proxyVerified = false;
        let proxyAttempts = 0;

        while (!proxyVerified && proxyAttempts < MAX_PROXY_CHECK_ATTEMPTS) {
            logger().info('测试代理IP是否正常');
            try {
                const response = await sendRequest('https://myip.ipip.net', {
                    method: 'get',
                    httpAgent: agent,
                    httpsAgent: agent
                });
                logger().info(`验证成功, IP信息: ${JSON.stringify(response)}`);
                proxyVerified = true;
            } catch (error) {
                proxyAttempts++;
                logger().warn('代理失效，等待1分钟后重新验证');
                await sleep(60);
            }
        }

        if (!proxyVerified) {
            logger().error('代理验证失败，无法继续执行任务');
            return;
        }

        let currentIndex = 0;

        async function worker() {
            while (currentIndex < addresses.length) {
                const address = addresses[currentIndex++];
                let checksumAddress;
                try {
                    checksumAddress = ethers.utils.getAddress(address);
                } catch (error) {
                    logger().error(`地址格式错误: ${address}`, error);
                    continue;
                }
                await claimToken(checksumAddress);
            }
        }

        const workers = Array(CONCURRENT_REQUESTS).fill(null).map(() => worker());
        await Promise.all(workers);

    } catch (error) {
        logger().error('处理地址列表时出错:', error);
    }
}

main();
