const { MnemonicKey } = require('@initia/initia.js');
const bip39 = require('bip39');
const fs = require('fs');
const path = require('path');

const numberOfWallets = 5000; // 生成的钱包数量

function generateMnemonic() {
  return bip39.generateMnemonic();
}

function generateKeyFromMnemonic(mnemonic, account = 0, index = 0) {
  return new MnemonicKey({
    mnemonic: mnemonic,
    account: account,
    index: index,
    coinType: 118,
  });
}

function saveToCSV(filename, wallets) {
  const csvContent = `Mnemonic,Address,PrivateKey\n${wallets.map(wallet => `${wallet.mnemonic},${wallet.address},${wallet.privateKey}`).join('\n')}\n`;
  fs.writeFileSync(path.join(__dirname, filename), csvContent, 'utf8');
  console.log(`${filename} 文件已保存`);
}

const wallets = [];

for (let i = 0; i < numberOfWallets; i++) {
  const mnemonic = generateMnemonic();
  const key = generateKeyFromMnemonic(mnemonic, 0, 0);
  wallets.push({
    mnemonic: mnemonic,
    address: key.accAddress,
    privateKey: key.privateKey.toString('hex')
  });
}

wallets.forEach((wallet, index) => {
  console.log(`钱包 ${index + 1}:`);
  console.log('助记词:', wallet.mnemonic);
  console.log('地址:', wallet.address);
  console.log('私钥:', wallet.privateKey);
});

saveToCSV('account.csv', wallets);
