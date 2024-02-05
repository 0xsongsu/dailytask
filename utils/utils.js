const axios = require('axios');
const config = require('../config/runner.json');

const  sleep = (seconds) => {
    const milliseconds = seconds * 1000;
    return new Promise(resolve => setTimeout(resolve, milliseconds));
  };

function randomPause() {
    const minSeconds = Math.ceil(config.minInterval);
    const maxSeconds = Math.floor(config.maxInterval);
    return Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds;
}

async function sendRequest(url, urlConfig, timeout = 10000, maxRetries = 5) {
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
        } catch (error) {
            console.error(error.message);
            if (error.message.includes('timed out')) {
                retries++;
                console.log(`请求超时，开始重试第 ${retries} 次`);
            } else {
                throw error;
            }
        } finally {
            clearTimeout(timer);
        }
    }

    throw new Error(`Request failed after ${maxRetries} retries`);
}



module.exports = { sleep ,randomPause, sendRequest};