const fs = require('fs').promises;
const { DirectSecp256k1HdWallet } = require("@cosmjs/proto-signing");
const { SigningStargateClient } = require("@cosmjs/stargate");
const { Bip39, Random } = require("@cosmjs/crypto");
const { HttpsProxyAgent } = require('https-proxy-agent');
const readlineSync = require('readline-sync');
const config = require('../../config/runner.json');
const { sleep } = require('../../utils/utils.js');
const fakeUa = require('fake-useragent');
const csvParser = require('csv-parser');
const userAgent = fakeUa();
const agent = new HttpsProxyAgent(config.proxy);


//程序配置
const totalSendTimes = 5; // 修改成总发送次数
const sendToMe = true; // 修改成是否发送到自己的钱包，true为发送到自己的钱包，false为发送到随机地址


async function generateAxelarAddressFromMnemonic() {
    const mnemonic = Bip39.encode(Random.getBytes(16)).toString();
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(
        mnemonic,
        { prefix: "axelar" },
    );

    const [firstAccount] = await wallet.getAccounts();
    console.log("随机生成地址:", firstAccount.address);
    return firstAccount.address;
}

function getRandomTransferAmount() {
    const min = 1000; // 转账数量最小值
    const max = 3000; // 转账数量最大值
    return Math.floor(Math.random() * (max - min + 1) + min).toString();
}

function getRandomGasAmount() {
    const min = 700; // Gas费用数量最小值
    const max = 1000; // Gas费用数量最大值
    return Math.floor(Math.random() * (max - min + 1) + min).toString();
}

async function sendRandomAmount(totalSendTimes, sendToMe) {
    const walletsData = await fs.readFile('./cosmosWallet.csv', { encoding: 'utf8' });
    const rpcData = await fs.readFile('rpcData.csv', 'utf8');
    const walletLines = walletsData.split('\n').filter(Boolean).slice(1);
    const lines = rpcData.split('\n').slice(1);
    const rpcUrls = lines.map(line => {
        const columns = line.split(',');
        return columns.length > 4 ? columns[4] : undefined;
    }).filter(url => url && url.trim());

    const maxRetries = 5; // 最大重试次数，可根据需要调整

    for (let i = 0; i < totalSendTimes; i++) {
        for (const line of walletLines) {
            const [mnemonic] = line.split(',');

            const wtSigner = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
                prefix: "axelar",
            });

            const accounts = await wtSigner.getAccounts();
            const wtAddress = accounts[0].address;

            const recipientAddress = sendToMe ? wtAddress : await generateAxelarAddressFromMnemonic();

            const transferCoinName = "uaxl";
            let attempt = 0; // 当前重试次数

            while (attempt < maxRetries) {
                try {
                    const transferAmount = getRandomTransferAmount();
                    const gasAmount = getRandomGasAmount();

                    const selectedRpcUrl = rpcUrls[Math.floor(Math.random() * rpcUrls.length)]; // 随机选择一个 RPC 地址

                    const client = await SigningStargateClient.connectWithSigner(selectedRpcUrl, wtSigner, agent);

                    console.log(`使用Rpc #${selectedRpcUrl},已发送 #${i + 1} 次, 共 ${totalSendTimes} 次`);
                    console.log(`尝试 #${attempt + 1}: 从${wtAddress}发送到${recipientAddress}, 金额: ${transferAmount} ${transferCoinName}`);

                    const result = await client.sendTokens(
                        wtAddress,
                        recipientAddress,
                        [{ denom: transferCoinName, amount: transferAmount.toString() }],
                        {
                            amount: [{ denom: transferCoinName, amount: gasAmount.toString() }],
                            gas: "100000", // 根据需要调整gas值
                        },
                        " "
                    );

                    if (result.transactionHash) {
                        console.log(`发送成功，交易哈希: ${result.transactionHash}`);
                        break;
                    } else {
                        throw new Error("交易未返回哈希值");
                    }
                } catch (error) {
                    console.error(`发送失败: ${error.message}`);
                    if (error.message.includes("Bad status on response: 500") || !error.transactionHash) {
                        attempt++;
                        console.log(`等待重试 #${attempt}`);
                        await sleep(5); // 重试前等待，可根据需要调整
                    } else {
                        break;
                    }
                }
            }

            if (attempt === maxRetries) {
                console.log(`达到最大重试次数，停止发送`);
            }

            const randomDelay = Math.floor(Math.random() * (30 - 10 + 1) + 10);
            console.log(`等待${randomDelay / 10}秒后继续下一次`);
            await sleep(randomDelay); // 随机暂停10到30秒
        }
    }
}


sendRandomAmount(totalSendTimes, sendToMe).catch(console.error);
