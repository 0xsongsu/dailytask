const fs = require('fs');
const ethers = require('ethers');

// 替换成你的Lava RPC链接
const RpcUrl = 'https://eth1.lava.build/lava-referer-d5f807d7-3ed9-4f46-b622-f7e67db9a892/';
const provider = new ethers.providers.JsonRpcProvider(RpcUrl);

const csvFilePath = './wallet.csv';

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkBalanceAndAppend(line, provider) {
    const columns = line.split(',');
    const address = columns[0].trim();
    try {
        const balance = await provider.getBalance(address);
        const balanceEther = ethers.utils.formatEther(balance);
        console.log(`Address: ${address} - Balance: ${balanceEther} ETH`);
        return `\n${line}${columns.length > 1 ? '' : ','}${balanceEther}`;
    } catch (error) {
        console.error(`Error fetching balance for address ${address}: ${error}`);
        return `\n${line}`;
    }
}

fs.readFile(csvFilePath, 'utf8', async (err, data) => {
    if (err) {
        console.error(err);
        return;
    }
    const lines = data.split('\n');
    let newCsvContent = lines[0].includes('balance') ? lines[0] : lines[0] + ',balance';

    for (let i = 1; i < lines.length; i++) {
        if (lines[i]) {
            await delay(Math.floor(Math.random() * (3000 - 1000 + 1)) + 1000);
            const result = await checkBalanceAndAppend(lines[i], provider);
            newCsvContent += result;
        }
    }

    console.log(newCsvContent);
});
