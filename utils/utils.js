const axios = require('axios');
const config = require('../config/runner.json');
const readlineSync = require('readline-sync');
const crypto = require('crypto');

const  sleep = (seconds) => {
    const milliseconds = seconds * 1000;
    return new Promise(resolve => setTimeout(resolve, milliseconds));
  };

function randomPause() {
    const minSeconds = Math.ceil(config.minInterval);
    const maxSeconds = Math.floor(config.maxInterval);
    return Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds;
}

async function sendRequest(url, urlConfig, timeout = 10000, maxRetries = 3) {
    let retries = 0;

    while (retries < maxRetries) {
        const source = axios.CancelToken.source();
        const timer = setTimeout(() => {
            source.cancel(`Request timed out after ${timeout} ms`);
        }, timeout);

        const newConfig = {
            ...urlConfig,
            url: url,
            timeout: timeout,
            cancelToken: source.token,
            method: urlConfig.method || 'get',
            onDownloadProgress: () => clearTimeout(timer),
        };

        try {
            const response = await axios(newConfig);
            retries = maxRetries;
            return response.data;
        } 
            catch (error) {
                console.error(error.message);
                retries++;
                console.log(`请求失败，开始重试第 ${retries} 次`);
            
        } finally {
            clearTimeout(timer);
        }
    }

    throw new Error(`Request failed after ${maxRetries} retries`);
}

function getKeyFromUser() {
    let key;
    if (process.env.SCRIPT_PASSWORD) {
        key = process.env.SCRIPT_PASSWORD;
    } else {
        key = readlineSync.question('请输入你的密码: ', {
            hideEchoBack: true,
        });
    }
    return crypto.createHash('sha256').update(String(key)).digest('base64').substr(0, 32);
}

module.exports = { sleep ,randomPause, sendRequest, getKeyFromUser,};