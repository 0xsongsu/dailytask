const axios = require('axios');

const  sleep = (minutes) => {
    const milliseconds = minutes * 60 * 1000;
    return new Promise(resolve => setTimeout(resolve, milliseconds));
  };

function randomPause() {
    const minSeconds = Math.ceil(config.minInterval);
    const maxSeconds = Math.floor(config.maxInterval);
    return Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds;
}

async function sendRequest(url, urlConfig, timeout = 100000) {
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
        return response.data;
    } catch (error) {
        console.error(error.message);
        throw error;
    }
}

module.exports = { sleep ,randomPause, sendRequest};