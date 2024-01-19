const axios = require('axios');
const fs = require('fs');
const csv = require('csv-parser');
const config = require('../../config/runner.json');
const { HttpsProxyAgent } = require('https-proxy-agent');
const agent = new HttpsProxyAgent(config.proxy);
const fakeUa = require('fake-useragent');
const userAgent = fakeUa();
const { sleep, randomPause} = require('../../utils/utils.js');

async function claimRaffleRewards(address) {
    const headers = {
        'authority': 'robots.farm',
        'accept-language': 'zh-CN,zh;q=0.9',
        'referer': 'https://robots.farm/airdrop/quests',
        'sec-ch-ua': '"Google Chrome";v="117", "Not;A=Brand";v="8", "Chromium";v="117"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': userAgent,
    };
    
    const url = `https://robots.farm/api/raffle/v3/claim?address=${address}`;
    
    try {
        const response = await axios.get(url, { 
            headers: headers,
            httpsAgent: agent,
        });
        return response.data.message;
    } catch (error) {
        if (error.response && error.response.status === 403) {
            console.error(`错误，该地址无奖票或已领取过奖励`);
            return '无奖票或已领取';
        } else {
            throw error;
        }
    }
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
        console.log('开始领取奖励');

        for (const address of addresses) {
            console.log(`领取地址: ${address}`);
            let isClaimed = false; // 标记是否已领取或无奖票
            try {
                const result = await claimRaffleRewards(address);
                if (result !== '无奖票或已领取') {
                    console.log(`领取成功🏅`);
                } else {
                    console.log(`地址： ${address} 无奖票或已领取过奖励`);
                    isClaimed = true; // 已领取或无奖票，设置标记
                }
            } catch (error) {
                console.error(`领取失败❌，地址： ${address}:`, error);
            }

            if (!isClaimed) { // 只有在未领取的情况下才暂停
                const pauseTime = randomPause();
                console.log(`暂停 ${pauseTime} 秒`);
                await sleep(pauseTime);
            }
        }
        console.log('所有地址的奖励已经领取完毕。');
    } catch (error) {
        console.error('领取错误', error);
    }
}

main();
