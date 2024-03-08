const fs = require('fs').promises;
const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');
const ethers = require('ethers');
const config = require('../../config/runner.json');

// 代理服务器URL
const proxyUrl = config.proxy;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    const rpcData = await fs.readFile('rpcData.csv', 'utf8');
    const lines = rpcData.split('\n').slice(1); // 去除标题行
    const rpcUrls = lines.map(line => {
        const columns = line.split(',');
        // 确保每行都有至少4列（即index为3的列存在）
        return columns.length > 3 ? columns[3] : undefined;
    }).filter(url => url && url.trim()); // 过滤掉undefined和空字符串

    let counter = 0; // 添加一个计数器以跟踪已处理的地址数量

    while (true) { // 修改为死循环
        const mnemonic = ethers.Wallet.createRandom().mnemonic.phrase;
        const wallet = ethers.Wallet.fromMnemonic(mnemonic);
        const address = wallet.address;

        // 随机选择一个RPC URL，确保了rpcUrls中不会有undefined或空字符串
        const rpcUrl = rpcUrls[Math.floor(Math.random() * rpcUrls.length)];
        try {
            const result = await checkBalanceAndAppend(address, rpcUrl, config.proxy); // 确保proxyUrl来自配置或正确设置
            counter++;
            console.log(`${counter}: ${result}`);
            const delay = Math.floor(Math.random() * (9000)) + 1000; // 产生1秒到10秒之间的随机延迟
            console.log(`等待 ${delay / 1000} 秒...`);
            await sleep(delay);
        } catch (error) {
            console.error(`查询地址 ${address} 出错: ${error.message}`);
        }
    }
}


async function fetchWithProxy(url, body, proxyUrl) {
    const agent = new HttpsProxyAgent(proxyUrl);
    const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        agent: agent
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
}

async function checkBalanceAndAppend(address, rpcUrl, proxyUrl) {
    console.log(`Using RPC: ${rpcUrl}`);
    const jsonRpcPayload = {
        jsonrpc: "2.0",
        method: "eth_getBalance",
        params: [address, "latest"],
        id: 1,
    };

    const response = await fetchWithProxy(rpcUrl, jsonRpcPayload, proxyUrl);
    if (response.error) {
        throw new Error(response.error.message);
    }

    const balance = ethers.utils.formatUnits(response.result, 'ether');
    return `地址: ${address} - 余额: ${balance} ETH`;
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]]; // Swap
    }
    return array;
}

main().catch(console.error);
