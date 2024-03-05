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
    const rpcData = await fs.readFile('./rpc.csv', 'utf8');
    const rpcUrls = rpcData.split('\n').filter(line => line.trim());

    // 定义你想要生成地址的数量，建议rpc越多地址越多，最好是rpc数量*100
    const addressCount = 100; 

    for (let i = 0; i < addressCount; i++) {
        const mnemonic = ethers.Wallet.createRandom().mnemonic.phrase;
        const wallet = ethers.Wallet.fromMnemonic(mnemonic);
        const address = wallet.address;

        const rpcUrl = rpcUrls[Math.floor(Math.random() * rpcUrls.length)];
        try {
            const result = await checkBalanceAndAppend(address, rpcUrl, proxyUrl);
            console.log(i + 1, result);
            const delay = Math.floor(Math.random() * (10000 - 1000 + 1)) + 1000;
            console.log(`等待 ${delay / 1000} 秒...`);
        await sleep(delay);
        } catch (error) {
            console.error(`查询地址 ${address}出错: ${error.message}`);
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
