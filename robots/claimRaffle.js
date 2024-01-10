const fetch = require('node-fetch');
const fs = require('fs');
const csv = require('csv-parser');
const config = require('../config/runner.json');

function sleep(minutes) {
    return new Promise(resolve => setTimeout(resolve, minutes * 60000));
}

function randomPause() {
    const min = Math.ceil(config.minInterval);
    const max = Math.floor(config.maxInterval);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function claimRaffleRewards(address) {
    const headers = {
      'authority': 'robots.farm',
      'accept': '*/*',
      'accept-language': 'zh-CN,zh;q=0.9',
      'referer': 'https://robots.farm/airdrop/quests',
      'sec-ch-ua': '"Google Chrome";v="117", "Not;A=Brand";v="8", "Chromium";v="117"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
    };

    const params = new URLSearchParams({
        'address': address
    });

    try {
        const response = await fetch(`https://robots.farm/api/raffle/v3/claim?${params}`, {
            method: 'GET',
            headers: headers
        });
        const data = await response.json();
        return data["1"];
    } catch (error) {
        console.error('领取出错', error);
        throw error;
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

async function startClaimingRewards() {
    try {
        const addresses = await processAddresses(config.walletPath);
        console.log('开始领取奖励');

        for (const address of addresses) {
            console.log(`领取地址: ${address}`);
            try {
                const result = await claimRaffleRewards(address);
                console.log(`领取成功🏅，地址： ${address}:`, result);
            } catch (error) {
                console.error(`领取失败❌，地址： ${address}:`, error);
            }

            const pauseTime = randomPause();
            console.log(`暂停 ${pauseTime} 分钟`);
            await sleep(pauseTime);
        }
        console.log('所有地址的奖励已经领取完毕。');
    } catch (error) {
        console.error('领取错误', error);
    }
}

startClaimingRewards();
