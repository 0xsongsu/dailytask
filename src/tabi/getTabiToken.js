const axios = require('axios');
const fs = require('fs');
const csv = require('csv-parser');
const config = require('../../config/runner.json');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fakeUa = require('fake-useragent');
const userAgent = fakeUa();

const MAX_RETRIES = 5; // 最大重试次数
const MAX_PROXY_CHECK_ATTEMPTS = 3;

const agent = new HttpsProxyAgent(config.proxy);

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

async function verifyProxy(agent) {
    for (let attempt = 1; attempt <= MAX_PROXY_CHECK_ATTEMPTS; attempt++) {
        try {
            await axios.get('https://myip.ipip.net', { httpsAgent: agent });
            console.log('代理验证成功');
            return true;
        } catch (error) {
            console.log(`代理验证失败，尝试次数：${attempt}`);
            if (attempt < MAX_PROXY_CHECK_ATTEMPTS) await sleep(60000); // 等待1分钟
        }
    }
    return false;
}

async function main() {
    try {
        const addresses = await processAddresses(config.walletPath);
        console.log('开始领取测试币');

        const userAgent = fakeUa();
        const agent = new HttpsProxyAgent(config.proxy);
        const headers = {
            'accept': '*/*',
            'Accept-Encoding': 'gzip, deflate, br',
            'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'content-type': 'application/json',
            'origin': 'https://faucet.testnet.tabichain.com',
            'referer': 'https://faucet.testnet.tabichain.com/',
            'user-agent': userAgent,
        };

        if (!(await verifyProxy(agent))) {
            console.log('代理验证失败，无法继续执行任务');
            return;
        }

        for (const address of addresses) {
            console.log(`领取地址: ${address}`);

            for (let attempts = 0; attempts < MAX_RETRIES; attempts++) {
                try {
                    const url = `https://faucet-api.testnet.tabichain.com/api/faucet`;
                    const data = { address: address };
                    const response = await axios.post(url, data, {
                        headers: headers,
                        httpsAgent: agent,
                    });
                    console.log('领取成功✅ ', response.data.message);
                    sleep(3000); // 等待3秒
                    break; 
                } catch (error) {
                    console.error(`领取失败❌，地址：${address}: ${error.message}`);
                    if (attempts === MAX_RETRIES - 1) console.log('达到最大重试次数，继续下一个地址');
                    else await sleep(10000); // 等待10秒后重试
                }
            }
        }
    } catch (error) {
        console.error('发生错误:', error);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main();