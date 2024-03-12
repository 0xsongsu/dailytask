const fs = require('fs').promises;
const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');
const ethers = require('ethers');
const config = require('../../config/runner.json');

// 代理服务器URL
const proxyUrl = config.proxy;

async function getLatestBlockTransactions(rpcUrl, proxyUrl) {
    const jsonRpcPayloadForBlockNumber = {
        jsonrpc: "2.0",
        method: "eth_blockNumber",
        params: [],
        id: 1,
    };

    const blockNumberResponse = await fetchWithProxy(rpcUrl, jsonRpcPayloadForBlockNumber, proxyUrl);
    if (blockNumberResponse.error) {
        throw new Error(blockNumberResponse.error.message);
    }

    const blockNumber = blockNumberResponse.result;

    const jsonRpcPayloadForBlockTransactions = {
        jsonrpc: "2.0",
        method: "eth_getBlockByNumber",
        params: [blockNumber, true],
        id: 1,
    };

    const blockTransactionsResponse = await fetchWithProxy(rpcUrl, jsonRpcPayloadForBlockTransactions, proxyUrl);
    if (blockTransactionsResponse.error) {
        throw new Error(blockTransactionsResponse.error.message);
    }

    const transactions = blockTransactionsResponse.result.transactions;
    if (transactions.length === 0) {
        throw new Error("最新区块中没有交易。");
    }

    const randomTxIndex = Math.floor(Math.random() * transactions.length);
    const fromAddress = transactions[randomTxIndex].from;
    return fromAddress;
}

async function main() {
    const rpcData = await fs.readFile('rpcData.csv', 'utf8');
    const lines = rpcData.split('\n').slice(1); // 去除标题行
    const rpcUrls = lines.map(line => {
        const columns = line.split(',');
        return columns.length > 1 ? columns[1] : undefined;
    }).filter(url => url && url.trim()); // 过滤掉空URL

    let counter = 0; // 添加一个计数器以跟踪已处理的地址数量

    while (true) { // 修改为死循环
        const rpcUrl = rpcUrls[Math.floor(Math.random() * rpcUrls.length)];
        try {
            const address = await getLatestBlockTransactions(rpcUrl, config.proxy);
            const result = await checkBalanceAndAppend(address, rpcUrl, config.proxy);
            counter++;
            console.log(`${counter}: ${result}`);
            console.log('暂停1-5秒');
            await new Promise(resolve => setTimeout(resolve, Math.random() * 4000 + 1000));
            sleep = () => new Promise(resolve => setTimeout(resolve, Math.random() * 4000 + 1000));
            await sleep();
        } catch (error) {
            console.error(`查询地址出错: ${error.message}`);
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
        throw new Error(`请求出错，返回代码: ${response.status}`);
    }
    return await response.json();
}

async function checkBalanceAndAppend(address, rpcUrl, proxyUrl) {
    console.log(`使用RPC: ${rpcUrl}`);
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

main().catch(console.error);
