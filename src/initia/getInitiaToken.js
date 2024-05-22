const fs = require("fs");
const config = require("../../config/runner.json");
const { HttpsProxyAgent } = require('https-proxy-agent');
const { solver } = require("../../utils/challengeSolver/initia_solver.js");
const fakeUa = require("fake-useragent");
const userAgent = fakeUa();
const { sleep, sendRequest, logger } = require("../../utils/utils.js");
const {
  createTask,
  getTaskResult,
} = require("../../utils/yesCaptcha/yesCaptcha.js");
const axios = require("axios");

const MAX_RETRIES = 10; // 最大重试次数
const MAX_PROXY_CHECK_ATTEMPTS = 3; // 代理检查次数
const CONCURRENT_REQUESTS = 10; // 并发请求数量
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";
const agent = new HttpsProxyAgent(config.proxy);
const websiteKey = "04d28d90-d5b9-4a90-94e5-a12c595bd4e2";
const websiteUrl = "https://faucet.testnet.initia.xyz/";
const headers = {
  authority: "faucet-api.initiation-1.initia.xyz",
  accept: "application/json, text/plain,*/*",
  "accept-language": "zh-CN,zh;q=0.9",
  "cache-control": "no-cache",
  "content-type": "text/plain;charset=UTF-8",
  origin: "https://faucet.testnet.initia.xyz",
  pragma: "no-cache",
  referer: "https://faucet.testnet.initia.xyz/",
  "user-agent": userAgent,
};

async function recaptcha(pageAction) {
  const { taskId } = await createTask(
    websiteUrl,
    websiteKey,
    "HCaptchaTaskProxyless",
    pageAction
  );
  let result = await getTaskResult(taskId);
  if (!result) {
    await sleep(0.1);
    result = await getTaskResult(taskId);
  }
  if (!result) {
    throw new Error(`${pageAction} 人机验证失败`);
  }
  const { gRecaptchaResponse } = result.solution;
  return gRecaptchaResponse;
}

async function processAddresses(filePath) {
  const addresses = [];
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) {
        logger().error("读取地址失败:", err);
        return reject(err);
      }
      const lines = data.split("\n");
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine) {
          addresses.push(trimmedLine);
        }
      }
      logger().info("地址读取成功");
      resolve(addresses);
    });
  });
}

async function getChallenge() {
  let attempts = 0;
  while (attempts < MAX_RETRIES) {
    try {
      const url = "https://faucet-api.initiation-1.initia.xyz/create_challenge";
      const urlConfig = {
        headers: headers,
        httpsAgent: agent,
        httpAgent: agent,
      };

      const response = await axios.get(url, urlConfig);
      const data = response.data;
      const challenge = Buffer.from(data.challenge, "hex");
      const algorithm = data.algorithm;
      if (algorithm !== "SHA-256") {
        attempts++;
        console.error("不支持的算法:", algorithm);
        continue;
      }
      let start = Date.now();
      const result = solver(challenge, Buffer.from(data.salt), data.maxnumber);
      let took = parseInt((Date.now() - start) * 2);
      return btoa(
        JSON.stringify({
          algorithm: algorithm,
          challenge: data.challenge,
          number: result,
          salt: data.salt,
          signature: data.signature,
          took: took,
        })
      );
    } catch (error) {
      attempts++;
      if (error.response && error.response.data) {
        console.log(`获取challenge失败，正在重试第 ${attempts} 次...`);
        await sleep(5);
      } else {
        console.error(`获取challenge失败❌:`, error);
        throw new Error("计算失败");
      }
    }
  }
}

async function claimToken(address) {
  logger().info(`开始为 ${address} 地址领取测试币`);
  let attempts = 0;
  while (attempts < MAX_RETRIES) {
    try {
      const recaptchaToken = await recaptcha("faucet");
      const challenge = await getChallenge();
      const url = `https://faucet-api.initiation-1.initia.xyz/claim`;
      const data = {
        address: address,
        altcha_payload: challenge,
        denom: "uinit",
        h_captcha: recaptchaToken,
      };
      const urlConfig = {
        headers: headers,
        httpsAgent: agent,
        httpAgent: agent,
      };

      const response = await axios.post(url, data, urlConfig);
      const amount = response.data.amount;
      logger().info(`地址 ${address}领取成功✅ ${amount}`);
      return;
    } catch (error) {
      attempts++;
      if (
        error.response &&
        error.response.data &&
        error.response.data.message ===
          "Faucet is overloading, please try again"
      ) {
        logger().info(`地址${address}正在重试第 ${attempts} 次...`);
        await sleep(5);
      } else if (error.message.includes("人机验证失败")) {
      } else if (error.response && error.response.status === 400) {
        logger().info(`地址${address}请求报错400，正在重试第 ${attempts} 次...`);
        await sleep(5);
      } else if (error.response && error.response.status === 429) {
        logger().info(`地址${address}请求报错429，正在重试第 ${attempts} 次...`);
        await sleep(5);
      } else {
        logger().error(`领取失败❌，地址：${address}:`, error);
        return;
      }
    }
  }
}

async function main() {
  try {
    const addresses = await processAddresses("./address.txt");

    let proxyVerified = false;
    let proxyAttempts = 0;

    while (!proxyVerified && proxyAttempts < MAX_PROXY_CHECK_ATTEMPTS) {
      logger().info("开始验证代理是否可用");
      try {
        const response = await sendRequest("https://myip.ipip.net", {
          method: "get",
          httpAgent: agent,
          httpsAgent: agent,
        });
        logger().info(`代理验证成功，IP: ${response}`);
        proxyVerified = true;
      } catch (error) {
        proxyAttempts++;
        logger().error("代理验证失败:", error);
        await sleep(60);
      }
    }

    if (!proxyVerified) {
      logger().error("代理验证失败，无法继续执行任务");
      return;
    }

    let currentIndex = 0;

    async function worker() {
      while (currentIndex < addresses.length) {
        const address = addresses[currentIndex++];
        await claimToken(address);
      }
    }

    const workers = Array(CONCURRENT_REQUESTS).fill(null).map(() => worker());
    await Promise.all(workers);

  } catch (error) {
    logger().error("领取测试币失败:", error);
  }
}

main();
