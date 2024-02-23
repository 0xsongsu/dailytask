const { spawn } = require('child_process');
const readlineSync = require('readline-sync');
const path = require('path');

// 脚本路径列表
const scripts = [
    './src/web3go/reikiTask.js',
    './src/robots/getTicket.js',
    './src/robots/claimRaffle.js',
    './src/lāvaNet/lavaRun.js',
];

const password = readlineSync.question('请输入密码: ', {
    hideEchoBack: true  // 密码输入时不显示字符
});

runScript(0);

function runScript(index) {
    if (index < scripts.length) {
        const scriptName = path.basename(scripts[index], '.js');
        console.log(`开始执行脚本: ${scriptName}`);
        
        const childProcess = spawn('node', [scripts[index]], {
            env: { ...process.env, SCRIPT_PASSWORD: password },
            stdio: 'inherit'
        });

        childProcess.on('close', (code) => {
            console.log(`脚本 ${scriptName} 执行完成，退出码 ${code}`);
            if (index + 1 < scripts.length) {
                console.log(`脚本 ${scriptName} 执行完成，开始执行脚本 ${path.basename(scripts[index + 1], '.js')}`);
            }
            runScript(index + 1);
        });
    }
}